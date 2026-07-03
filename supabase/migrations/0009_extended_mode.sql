-- =====================================================================
-- 0009_extended_mode.sql
-- Thêm chế độ Mở rộng: elder, jester, alpha_wolf
-- - elder: sống sót lần cắn đầu tiên; nếu bị treo cổ → seer mất tác dụng
-- - jester: thắng ngay nếu bị dân treo cổ
-- - alpha_wolf: wolf + seer kết hợp (soi đêm)
-- =====================================================================

-- 1. Thêm action_type mới
ALTER TABLE public.night_actions
  DROP CONSTRAINT IF EXISTS night_actions_action_type_check;
ALTER TABLE public.night_actions
  ADD CONSTRAINT night_actions_action_type_check
  CHECK (action_type IN ('kill','save','check','protect','link','toxic','shoot','alpha_check','elder_shield'));

-- 2. Thêm cột vào game_players để theo dõi trạng thái đặc biệt
ALTER TABLE public.game_players
  ADD COLUMN IF NOT EXISTS elder_lives int NOT NULL DEFAULT 1,  -- Trưởng Làng còn mấy mạng
  ADD COLUMN IF NOT EXISTS seer_cursed  boolean NOT NULL DEFAULT false; -- Tiên Tri bị nguyền (elder bị treo cổ)

-- 3. Cập nhật winner có thể là 'jester' (kẻ điên thắng riêng)
ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_winner_check;
-- Không cần check constraint, winner text là nullable

-- 4. RPC: alpha_wolf_check — Sói Tiên Tri soi người
CREATE OR REPLACE FUNCTION public.alpha_wolf_check(
  p_session_id uuid,
  p_target_profile_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller public.game_players;
  v_target public.game_players;
  v_day    int;
BEGIN
  SELECT * INTO v_caller
  FROM public.game_players
  WHERE session_id = p_session_id AND profile_id = auth.uid();

  IF v_caller.id IS NULL OR v_caller.role <> 'alpha_wolf' OR v_caller.is_alive = false THEN
    RAISE EXCEPTION 'Chỉ Sói Tiên Tri còn sống mới được dùng năng lực này';
  END IF;

  SELECT * INTO v_target
  FROM public.game_players
  WHERE session_id = p_session_id AND profile_id = p_target_profile_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Mục tiêu không hợp lệ';
  END IF;

  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  -- Ghi nhận hành động
  INSERT INTO public.night_actions (session_id, day_number, actor_id, action_type, target_id)
  VALUES (p_session_id, v_day, v_caller.id, 'alpha_check', v_target.id)
  ON CONFLICT (session_id, day_number, actor_id, action_type)
  DO UPDATE SET target_id = EXCLUDED.target_id;

  RETURN v_target.role;
END;
$$;

-- 5. Cập nhật resolve_vote để xử lý Kẻ Điên thắng và Elder bị treo cổ
CREATE OR REPLACE FUNCTION public.resolve_vote(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day           int;
  v_hanged        uuid;
  v_hanged_role   text;
  v_top_count     int;
  v_second_count  int;
BEGIN
  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  WITH tally AS (
    SELECT target_id, count(*) AS c
    FROM public.votes
    WHERE session_id = p_session_id AND day_number = v_day AND target_id IS NOT NULL
    GROUP BY target_id
    ORDER BY c DESC
  )
  SELECT target_id, c INTO v_hanged, v_top_count FROM tally LIMIT 1;

  SELECT c INTO v_second_count FROM (
    SELECT count(*) AS c
    FROM public.votes
    WHERE session_id = p_session_id AND day_number = v_day AND target_id IS NOT NULL
    GROUP BY target_id
    ORDER BY c DESC
    OFFSET 1 LIMIT 1
  ) t;

  -- Hòa phiếu → không ai chết
  IF v_top_count IS NOT NULL AND v_top_count = coalesce(v_second_count, -1) THEN
    v_hanged := null;
  END IF;

  IF v_hanged IS NOT NULL THEN
    SELECT role INTO v_hanged_role FROM public.game_players WHERE id = v_hanged;

    -- Kẻ Điên bị treo cổ → thắng ngay
    IF v_hanged_role = 'jester' THEN
      UPDATE public.game_players
        SET is_alive = false, died_at_phase = 'day_vote', died_at_day = v_day
        WHERE id = v_hanged;

      UPDATE public.game_sessions
        SET phase = 'game_over', winner = 'jester', ended_at = now(), phase_ends_at = NULL
        WHERE id = p_session_id;

      UPDATE public.rooms SET status = 'finished'
        WHERE id = (SELECT room_id FROM public.game_sessions WHERE id = p_session_id);
      RETURN;
    END IF;

    -- Elder bị treo cổ → đánh dấu Tiên Tri bị nguyền (seer_cursed)
    IF v_hanged_role = 'elder' THEN
      UPDATE public.game_players
        SET seer_cursed = true
        WHERE session_id = p_session_id AND role = 'seer';
    END IF;

    UPDATE public.game_players
      SET is_alive = false, died_at_phase = 'day_vote', died_at_day = v_day
      WHERE id = v_hanged;

    -- Tình nhân chết chùm
    UPDATE public.game_players lover
      SET is_alive = false, died_at_phase = 'day_vote_lover', died_at_day = v_day
      FROM public.game_players victim
      WHERE victim.id = v_hanged
        AND lover.id = victim.lover_id
        AND lover.is_alive = true;
  END IF;

  UPDATE public.game_sessions
    SET phase = 'day_vote_result', phase_ends_at = now() + interval '12 seconds'
    WHERE id = p_session_id;

  PERFORM public.check_win_condition(p_session_id);
END;
$$;

-- 6. Cập nhật resolve_night để xử lý Elder sống sót lần cắn đầu
CREATE OR REPLACE FUNCTION public.resolve_night(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day              int;
  v_kill_target      uuid;
  v_kill_target_role text;
  v_elder_lives      int;
  v_protected_target uuid;
  v_saved_target     uuid;
  v_toxic_target     uuid;
  v_victim           uuid;
  v_dead_players     uuid[] := '{}';
BEGIN
  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  SELECT target_id INTO v_kill_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'kill'
  GROUP BY target_id ORDER BY count(*) DESC LIMIT 1;

  SELECT target_id INTO v_protected_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'protect'
  LIMIT 1;

  SELECT target_id INTO v_saved_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'save'
  LIMIT 1;

  SELECT target_id INTO v_toxic_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'toxic'
  LIMIT 1;

  -- Xử lý mục tiêu bị cắn
  IF v_kill_target IS NOT NULL
     AND v_kill_target IS DISTINCT FROM v_protected_target
     AND v_kill_target IS DISTINCT FROM v_saved_target THEN

    SELECT role, elder_lives INTO v_kill_target_role, v_elder_lives
    FROM public.game_players WHERE id = v_kill_target;

    IF v_kill_target_role = 'elder' AND v_elder_lives > 0 THEN
      -- Elder còn mạng → trừ mạng, không chết
      UPDATE public.game_players SET elder_lives = elder_lives - 1 WHERE id = v_kill_target;
    ELSE
      v_dead_players := array_append(v_dead_players, v_kill_target);
    END IF;
  END IF;

  -- Xử lý nạn nhân bị đầu độc
  IF v_toxic_target IS NOT NULL THEN
    v_dead_players := array_append(v_dead_players, v_toxic_target);
  END IF;

  IF array_length(v_dead_players, 1) > 0 THEN
    FOREACH v_victim IN ARRAY v_dead_players LOOP
      UPDATE public.game_players
        SET is_alive = false, died_at_phase = 'night', died_at_day = v_day
        WHERE id = v_victim AND is_alive = true;

      UPDATE public.game_players lover
        SET is_alive = false, died_at_phase = 'night_lover', died_at_day = v_day
        FROM public.game_players victim
        WHERE victim.id = v_victim
          AND lover.id = victim.lover_id
          AND lover.is_alive = true;
    END LOOP;
  END IF;

  UPDATE public.game_sessions
    SET phase = 'day_result', phase_ends_at = now() + interval '12 seconds'
    WHERE id = p_session_id;

  PERFORM public.check_win_condition(p_session_id);
END;
$$;

-- 7. Cập nhật check_player_role: Tiên Tri bị nguyền (seer_cursed) luôn trả về 'villager'
CREATE OR REPLACE FUNCTION public.check_player_role(
  p_session_id uuid,
  p_target_profile_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller    public.game_players;
  v_target    public.game_players;
  v_has_checked boolean;
  v_day       int;
BEGIN
  SELECT * INTO v_caller
  FROM public.game_players
  WHERE session_id = p_session_id AND profile_id = auth.uid();

  IF v_caller.id IS NULL OR v_caller.role <> 'seer' OR v_caller.is_alive = false THEN
    RAISE EXCEPTION 'Chỉ Tiên tri còn sống mới được thực hiện hành động này';
  END IF;

  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  SELECT EXISTS (
    SELECT 1 FROM public.night_actions
    WHERE session_id = p_session_id
      AND day_number = v_day
      AND actor_id = v_caller.id
      AND action_type = 'check'
      AND target_id = (
        SELECT id FROM public.game_players
        WHERE session_id = p_session_id AND profile_id = p_target_profile_id
      )
  ) INTO v_has_checked;

  IF NOT v_has_checked THEN
    RAISE EXCEPTION 'Bạn chưa thực hiện soi người chơi này đêm nay';
  END IF;

  -- Nếu Tiên Tri bị nguyền (elder bị treo cổ) → luôn báo 'villager'
  IF v_caller.seer_cursed THEN
    RETURN 'villager';
  END IF;

  SELECT * INTO v_target
  FROM public.game_players
  WHERE session_id = p_session_id AND profile_id = p_target_profile_id;

  IF v_target.role IN ('wolf', 'alpha_wolf') THEN
    RETURN 'wolf';
  ELSE
    RETURN 'villager';
  END IF;
END;
$$;

-- 8. submit_night_action: cho phép alpha_wolf dùng 'alpha_check' (validate trong RPC riêng)
--    và chặn jester/elder khỏi submit action đêm
CREATE OR REPLACE FUNCTION public.submit_night_action(
  p_session_id uuid,
  p_action_type text,
  p_target_profile_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    public.game_players;
  v_target   public.game_players;
  v_day      int;
  v_target_id uuid := NULL;
BEGIN
  SELECT * INTO v_actor
  FROM public.game_players
  WHERE session_id = p_session_id AND profile_id = auth.uid();

  IF v_actor.id IS NULL OR v_actor.is_alive = false THEN
    RAISE EXCEPTION 'Bạn không thể thực hiện hành động này';
  END IF;

  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.game_sessions
    WHERE id = p_session_id AND phase = 'night_actions'
  ) THEN
    RAISE EXCEPTION 'Chỉ được hành động trong pha ban đêm';
  END IF;

  -- Validate vai trò ↔ hành động
  IF p_action_type = 'kill'    AND v_actor.role NOT IN ('wolf', 'alpha_wolf') THEN
    RAISE EXCEPTION 'Chỉ Ma Sói mới được cắn';
  ELSIF p_action_type = 'check'   AND v_actor.role <> 'seer'       THEN RAISE EXCEPTION 'Chỉ Tiên Tri mới được soi';
  ELSIF p_action_type = 'protect' AND v_actor.role <> 'guard'      THEN RAISE EXCEPTION 'Chỉ Bảo Vệ mới được bảo vệ';
  ELSIF p_action_type IN ('save','toxic') AND v_actor.role <> 'witch' THEN RAISE EXCEPTION 'Chỉ Phù Thủy mới dùng thuốc';
  END IF;

  IF p_target_profile_id IS NOT NULL THEN
    SELECT * INTO v_target
    FROM public.game_players
    WHERE session_id = p_session_id AND profile_id = p_target_profile_id;

    IF v_target.id IS NULL OR v_target.is_alive = false THEN
      RAISE EXCEPTION 'Mục tiêu không hợp lệ hoặc đã chết';
    END IF;
    v_target_id := v_target.id;
  END IF;

  INSERT INTO public.night_actions (session_id, day_number, actor_id, action_type, target_id)
  VALUES (p_session_id, v_day, v_actor.id, p_action_type, v_target_id)
  ON CONFLICT (session_id, day_number, actor_id, action_type)
  DO UPDATE SET target_id = EXCLUDED.target_id;
END;
$$;
