-- =====================================================================
-- 0010_new_roles.sql
-- Thêm 4 vai mới: silencer, detective, avenger_wolf, doppelganger
-- =====================================================================

-- 1. Mở rộng action_type
ALTER TABLE public.night_actions
  DROP CONSTRAINT IF EXISTS night_actions_action_type_check;
ALTER TABLE public.night_actions
  ADD CONSTRAINT night_actions_action_type_check
  CHECK (action_type IN (
    'kill','save','check','protect','link','toxic','shoot',
    'elder_shield','alpha_check',
    'silence','detective_check','doppelganger_mark'
  ));

-- 2. Thêm cột mới vào game_players
ALTER TABLE public.game_players
  ADD COLUMN IF NOT EXISTS is_silenced         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doppelganger_target_id uuid REFERENCES public.game_players(id);

-- 3. RPC: silencer_silence — Phù Thủy Câm câm 1 người
CREATE OR REPLACE FUNCTION public.silencer_silence(
  p_session_id uuid,
  p_target_profile_id uuid
)
RETURNS void
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

  IF v_caller.id IS NULL OR v_caller.role <> 'silencer' OR v_caller.is_alive = false THEN
    RAISE EXCEPTION 'Chỉ Phù Thủy Câm còn sống mới được dùng năng lực này';
  END IF;

  SELECT * INTO v_target
  FROM public.game_players
  WHERE session_id = p_session_id AND profile_id = p_target_profile_id;

  IF v_target.id IS NULL OR v_target.is_alive = false THEN
    RAISE EXCEPTION 'Mục tiêu không hợp lệ';
  END IF;

  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  INSERT INTO public.night_actions (session_id, day_number, actor_id, action_type, target_id)
  VALUES (p_session_id, v_day, v_caller.id, 'silence', v_target.id)
  ON CONFLICT (session_id, day_number, actor_id, action_type)
  DO UPDATE SET target_id = EXCLUDED.target_id;
END;
$$;

-- 4. RPC: detective_investigate — Thám Tử điều tra đội của người chơi
CREATE OR REPLACE FUNCTION public.detective_investigate(
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

  IF v_caller.id IS NULL OR v_caller.role <> 'detective' OR v_caller.is_alive = false THEN
    RAISE EXCEPTION 'Chỉ Thám Tử còn sống mới được điều tra';
  END IF;

  SELECT * INTO v_target
  FROM public.game_players
  WHERE session_id = p_session_id AND profile_id = p_target_profile_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Mục tiêu không hợp lệ';
  END IF;

  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  INSERT INTO public.night_actions (session_id, day_number, actor_id, action_type, target_id)
  VALUES (p_session_id, v_day, v_caller.id, 'detective_check', v_target.id)
  ON CONFLICT (session_id, day_number, actor_id, action_type)
  DO UPDATE SET target_id = EXCLUDED.target_id;

  -- Trả về đội: 'wolves', 'villagers', hoặc 'neutral'
  RETURN CASE
    WHEN v_target.role IN ('wolf', 'alpha_wolf', 'avenger_wolf') THEN 'wolves'
    WHEN v_target.role IN ('jester', 'cupid', 'doppelganger')   THEN 'neutral'
    ELSE 'villagers'
  END;
END;
$$;

-- 5. RPC: doppelganger_mark — Kẻ Nhân Bản đánh dấu mục tiêu đêm 1
CREATE OR REPLACE FUNCTION public.doppelganger_mark(
  p_session_id uuid,
  p_target_profile_id uuid
)
RETURNS void
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

  IF v_caller.id IS NULL OR v_caller.role <> 'doppelganger' OR v_caller.is_alive = false THEN
    RAISE EXCEPTION 'Chỉ Kẻ Nhân Bản còn sống mới được đánh dấu';
  END IF;

  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  IF v_day <> 1 THEN
    RAISE EXCEPTION 'Kẻ Nhân Bản chỉ đánh dấu vào Đêm 1';
  END IF;

  SELECT * INTO v_target
  FROM public.game_players
  WHERE session_id = p_session_id AND profile_id = p_target_profile_id;

  IF v_target.id IS NULL OR v_target.profile_id = auth.uid() THEN
    RAISE EXCEPTION 'Mục tiêu không hợp lệ';
  END IF;

  -- Lưu target vào cột doppelganger_target_id
  UPDATE public.game_players
  SET doppelganger_target_id = v_target.id
  WHERE id = v_caller.id;

  INSERT INTO public.night_actions (session_id, day_number, actor_id, action_type, target_id)
  VALUES (p_session_id, v_day, v_caller.id, 'doppelganger_mark', v_target.id)
  ON CONFLICT (session_id, day_number, actor_id, action_type)
  DO UPDATE SET target_id = EXCLUDED.target_id;
END;
$$;

-- 6. Cập nhật resolve_night: áp dụng silence vào ngày hôm sau + xử lý avenger_wolf kéo người
-- Silence được apply vào is_silenced SAU khi resolve đêm (cho ngày hôm sau)
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
  v_silence_target   uuid;
  v_victim           uuid;
  v_dead_players     uuid[] := '{}';
BEGIN
  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  -- Lấy các hành động đêm nay
  SELECT target_id INTO v_kill_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'kill'
  GROUP BY target_id ORDER BY count(*) DESC LIMIT 1;

  SELECT target_id INTO v_protected_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'protect' LIMIT 1;

  SELECT target_id INTO v_saved_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'save' LIMIT 1;

  SELECT target_id INTO v_toxic_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'toxic' LIMIT 1;

  SELECT target_id INTO v_silence_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'silence' LIMIT 1;

  -- Xóa silence cũ của ngày trước (mỗi đêm câm mới)
  UPDATE public.game_players SET is_silenced = false WHERE session_id = p_session_id;

  -- Áp dụng silence mới cho ngày hôm sau
  IF v_silence_target IS NOT NULL THEN
    UPDATE public.game_players SET is_silenced = true WHERE id = v_silence_target;
  END IF;

  -- Xử lý mục tiêu bị cắn
  IF v_kill_target IS NOT NULL
     AND v_kill_target IS DISTINCT FROM v_protected_target
     AND v_kill_target IS DISTINCT FROM v_saved_target THEN

    SELECT role, elder_lives INTO v_kill_target_role, v_elder_lives
    FROM public.game_players WHERE id = v_kill_target;

    IF v_kill_target_role = 'elder' AND v_elder_lives > 0 THEN
      UPDATE public.game_players SET elder_lives = elder_lives - 1 WHERE id = v_kill_target;
    ELSE
      v_dead_players := array_append(v_dead_players, v_kill_target);
    END IF;
  END IF;

  -- Độc của phù thủy
  IF v_toxic_target IS NOT NULL THEN
    v_dead_players := array_append(v_dead_players, v_toxic_target);
  END IF;

  IF array_length(v_dead_players, 1) > 0 THEN
    FOREACH v_victim IN ARRAY v_dead_players LOOP
      UPDATE public.game_players
        SET is_alive = false, died_at_phase = 'night', died_at_day = v_day
        WHERE id = v_victim AND is_alive = true;

      -- Doppelganger: nếu người được đánh dấu chết, nhân bản vai
      UPDATE public.game_players dg
        SET role = victim.role
        FROM public.game_players victim
        WHERE victim.id = v_victim
          AND dg.doppelganger_target_id = v_victim
          AND dg.is_alive = true
          AND dg.role = 'doppelganger';

      -- Tình nhân chết chùm
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

-- 7. Cập nhật resolve_vote: avenger_wolf kéo 1 người ngẫu nhiên khi bị treo cổ
CREATE OR REPLACE FUNCTION public.resolve_vote(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day              int;
  v_hanged           uuid;
  v_hanged_role      text;
  v_top_count        int;
  v_second_count     int;
  v_avenger_victim   uuid;
BEGIN
  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  WITH tally AS (
    SELECT target_id, count(*) AS c
    FROM public.votes
    WHERE session_id = p_session_id AND day_number = v_day AND target_id IS NOT NULL
    GROUP BY target_id ORDER BY c DESC
  )
  SELECT target_id, c INTO v_hanged, v_top_count FROM tally LIMIT 1;

  SELECT c INTO v_second_count FROM (
    SELECT count(*) AS c FROM public.votes
    WHERE session_id = p_session_id AND day_number = v_day AND target_id IS NOT NULL
    GROUP BY target_id ORDER BY c DESC OFFSET 1 LIMIT 1
  ) t;

  IF v_top_count IS NOT NULL AND v_top_count = coalesce(v_second_count, -1) THEN
    v_hanged := null;
  END IF;

  IF v_hanged IS NOT NULL THEN
    SELECT role INTO v_hanged_role FROM public.game_players WHERE id = v_hanged;

    -- Kẻ Điên thắng ngay
    IF v_hanged_role = 'jester' THEN
      UPDATE public.game_players SET is_alive = false, died_at_phase = 'day_vote', died_at_day = v_day WHERE id = v_hanged;
      UPDATE public.game_sessions SET phase = 'game_over', winner = 'jester', ended_at = now(), phase_ends_at = NULL WHERE id = p_session_id;
      UPDATE public.rooms SET status = 'finished' WHERE id = (SELECT room_id FROM public.game_sessions WHERE id = p_session_id);
      RETURN;
    END IF;

    -- Elder bị treo cổ → nguyền Tiên Tri
    IF v_hanged_role = 'elder' THEN
      UPDATE public.game_players SET seer_cursed = true WHERE session_id = p_session_id AND role = 'seer';
    END IF;

    UPDATE public.game_players
      SET is_alive = false, died_at_phase = 'day_vote', died_at_day = v_day
      WHERE id = v_hanged;

    -- Doppelganger: nhân bản vai nếu đánh dấu người bị treo cổ
    UPDATE public.game_players dg
      SET role = v_hanged_role
      FROM public.game_players victim
      WHERE victim.id = v_hanged
        AND dg.doppelganger_target_id = v_hanged
        AND dg.is_alive = true
        AND dg.role = 'doppelganger';

    -- Avenger Wolf: kéo theo 1 người ngẫu nhiên (không phải Sói khác)
    IF v_hanged_role = 'avenger_wolf' THEN
      SELECT id INTO v_avenger_victim
      FROM public.game_players
      WHERE session_id = p_session_id
        AND is_alive = true
        AND id <> v_hanged
        AND role NOT IN ('wolf', 'alpha_wolf', 'avenger_wolf')
      ORDER BY random()
      LIMIT 1;

      IF v_avenger_victim IS NOT NULL THEN
        UPDATE public.game_players
          SET is_alive = false, died_at_phase = 'avenger_drag', died_at_day = v_day
          WHERE id = v_avenger_victim;
      END IF;
    END IF;

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

-- 8. Cập nhật check_win_condition: avenger_wolf tính vào phe sói
CREATE OR REPLACE FUNCTION public.check_win_condition(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wolves_alive    int;
  v_villagers_alive int;
  v_winner          text;
BEGIN
  SELECT
    count(*) FILTER (WHERE role IN ('wolf','alpha_wolf','avenger_wolf') AND is_alive),
    count(*) FILTER (WHERE role NOT IN ('wolf','alpha_wolf','avenger_wolf') AND is_alive)
  INTO v_wolves_alive, v_villagers_alive
  FROM public.game_players
  WHERE session_id = p_session_id;

  IF v_wolves_alive = 0 THEN
    v_winner := 'villagers';
  ELSIF v_wolves_alive >= v_villagers_alive THEN
    v_winner := 'wolves';
  END IF;

  IF v_winner IS NOT NULL THEN
    UPDATE public.game_sessions
      SET phase = 'game_over', winner = v_winner, ended_at = now()
      WHERE id = p_session_id;

    UPDATE public.rooms SET status = 'finished'
      WHERE id = (SELECT room_id FROM public.game_sessions WHERE id = p_session_id);

    UPDATE public.profiles p SET wins = wins + 1
      FROM public.game_players gp
      WHERE gp.session_id = p_session_id AND gp.profile_id = p.id
        AND ((v_winner = 'wolves' AND gp.role IN ('wolf','alpha_wolf','avenger_wolf'))
          OR (v_winner = 'villagers' AND gp.role NOT IN ('wolf','alpha_wolf','avenger_wolf')));

    UPDATE public.profiles p SET losses = losses + 1
      FROM public.game_players gp
      WHERE gp.session_id = p_session_id AND gp.profile_id = p.id
        AND NOT ((v_winner = 'wolves' AND gp.role IN ('wolf','alpha_wolf','avenger_wolf'))
              OR (v_winner = 'villagers' AND gp.role NOT IN ('wolf','alpha_wolf','avenger_wolf')));
  END IF;
END;
$$;
