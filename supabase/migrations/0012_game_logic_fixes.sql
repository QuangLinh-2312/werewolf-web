-- =====================================================================
-- 0012_game_logic_fixes.sql
-- Sửa đổi logic game ở DB: chặn chat của người câm/chết, chết chùm avenger_drag,
-- cộng điểm thắng jester, giới hạn thuốc Phù Thủy & khiên Bảo Vệ.
-- =====================================================================

-- 1. Cập nhật RLS cho chat_messages (Chỉ người còn sống và không bị câm mới được chat public)
DROP POLICY IF EXISTS "Đọc chat theo đúng kênh được phép" ON public.chat_messages;
CREATE POLICY "Đọc chat theo đúng kênh được phép"
  ON public.chat_messages FOR SELECT
  USING (
    CASE chat_messages.channel
      WHEN 'public' THEN EXISTS (
        SELECT 1 FROM public.game_players gp
        WHERE gp.session_id = chat_messages.session_id
          AND gp.profile_id = auth.uid()
      )
      WHEN 'wolves' THEN EXISTS (
        SELECT 1 FROM public.game_players gp
        WHERE gp.session_id = chat_messages.session_id
          AND gp.profile_id = auth.uid()
          AND gp.role IN ('wolf', 'alpha_wolf', 'avenger_wolf')
      )
      WHEN 'ghost' THEN EXISTS (
        SELECT 1 FROM public.game_players gp
        WHERE gp.session_id = chat_messages.session_id
          AND gp.profile_id = auth.uid()
          AND gp.is_alive = false
      )
      ELSE false
    END
  );

DROP POLICY IF EXISTS "Chỉ gửi chat đúng kênh mình có quyền" ON public.chat_messages;
CREATE POLICY "Chỉ gửi chat đúng kênh mình có quyền"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (chat_messages.channel = 'public' AND EXISTS (
        SELECT 1 FROM public.game_players gp
        WHERE gp.session_id = chat_messages.session_id
          AND gp.profile_id = auth.uid()
          AND gp.is_alive = true
          AND gp.is_silenced = false
      ))
      OR (chat_messages.channel = 'wolves' AND EXISTS (
        SELECT 1 FROM public.game_players gp
        WHERE gp.session_id = chat_messages.session_id
          AND gp.profile_id = auth.uid()
          AND gp.role IN ('wolf', 'alpha_wolf', 'avenger_wolf')
          AND gp.is_alive = true
      ))
      OR (chat_messages.channel = 'ghost' AND EXISTS (
        SELECT 1 FROM public.game_players gp
        WHERE gp.session_id = chat_messages.session_id
          AND gp.profile_id = auth.uid()
          AND gp.is_alive = false
      ))
    )
  );

-- 2. Cập nhật resolve_vote để tính điểm cho jester và kéo tình nhân của nạn nhân Avenger Wolf
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
      
      -- Cộng wins cho Jester
      UPDATE public.profiles p SET wins = wins + 1
        FROM public.game_players gp
        WHERE gp.session_id = p_session_id AND gp.profile_id = p.id
          AND gp.role = 'jester';

      -- Cộng losses cho những người khác
      UPDATE public.profiles p SET losses = losses + 1
        FROM public.game_players gp
        WHERE gp.session_id = p_session_id AND gp.profile_id = p.id
          AND gp.role <> 'jester';

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

        -- Tình nhân của nạn nhân Avenger Wolf chết chùm
        UPDATE public.game_players lover
          SET is_alive = false, died_at_phase = 'avenger_drag_lover', died_at_day = v_day
          FROM public.game_players victim
          WHERE victim.id = v_avenger_victim
            AND lover.id = victim.lover_id
            AND lover.is_alive = true;
      END IF;
    END IF;

    -- Tình nhân chết chùm (người bị treo cổ)
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

-- 3. Cập nhật submit_night_action chặn spam thuốc của Phù thủy & khiên Bảo vệ liên tục
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
  v_actor      public.game_players;
  v_target     public.game_players;
  v_day        int;
  v_target_id  uuid := NULL;
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
  IF p_action_type = 'kill' AND v_actor.role NOT IN ('wolf', 'alpha_wolf') THEN
    RAISE EXCEPTION 'Chỉ Ma Sói mới được cắn';
  ELSIF p_action_type = 'check' AND v_actor.role <> 'seer' THEN
    RAISE EXCEPTION 'Chỉ Tiên Tri mới được soi';
  ELSIF p_action_type = 'protect' AND v_actor.role <> 'guard' THEN
    RAISE EXCEPTION 'Chỉ Bảo Vệ mới được bảo vệ';
  ELSIF p_action_type IN ('save', 'toxic') AND v_actor.role <> 'witch' THEN
    RAISE EXCEPTION 'Chỉ Phù Thủy mới dùng thuốc';
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

  -- Giới hạn dùng thuốc của Phù Thủy (1 lần mỗi trận cho mỗi loại thuốc)
  IF p_action_type = 'save' AND v_target_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.night_actions
    WHERE actor_id = v_actor.id AND action_type = 'save' AND target_id IS NOT NULL AND day_number < v_day
  ) THEN
    RAISE EXCEPTION 'Bạn đã dùng bình thuốc cứu rồi';
  ELSIF p_action_type = 'toxic' AND v_target_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.night_actions
    WHERE actor_id = v_actor.id AND action_type = 'toxic' AND target_id IS NOT NULL AND day_number < v_day
  ) THEN
    RAISE EXCEPTION 'Bạn đã dùng bình thuốc độc rồi';
  END IF;

  -- Giới hạn Bảo Vệ: Không tự bảo vệ/bảo vệ người khác 2 đêm liên tiếp
  IF p_action_type = 'protect' AND v_target_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.night_actions
    WHERE actor_id = v_actor.id
      AND action_type = 'protect'
      AND day_number = v_day - 1
      AND target_id = v_target_id
  ) THEN
    RAISE EXCEPTION 'Không thể bảo vệ cùng một người hai đêm liên tiếp';
  END IF;

  INSERT INTO public.night_actions (session_id, day_number, actor_id, action_type, target_id)
  VALUES (p_session_id, v_day, v_actor.id, p_action_type, v_target_id)
  ON CONFLICT (session_id, day_number, actor_id, action_type)
  DO UPDATE SET target_id = EXCLUDED.target_id;
END;
$$;
