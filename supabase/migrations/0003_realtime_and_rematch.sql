-- =====================================================================
-- 0003_realtime_and_rematch.sql
-- Sửa Realtime publication, rematch, và bảo vệ advance_phase
-- Chạy trong Supabase SQL Editor nếu chưa dùng supabase db push
-- =====================================================================

-- Bật REPLICA IDENTITY FULL để postgres_changes filter hoạt động đúng
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_players REPLICA IDENTITY FULL;
ALTER TABLE public.game_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.game_players REPLICA IDENTITY FULL;
ALTER TABLE public.votes REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.night_actions REPLICA IDENTITY FULL;

-- Thêm bảng còn thiếu vào Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.night_actions;

-- Sửa assign_roles: đặt timer cho night_intro
CREATE OR REPLACE FUNCTION public.assign_roles(p_room_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_settings jsonb;
  v_role_pool text[] := '{}';
  v_role text;
  v_count int;
  v_players_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rooms WHERE id = p_room_id AND host_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Chỉ chủ phòng mới được bắt đầu ván chơi';
  END IF;

  SELECT settings INTO v_settings FROM public.rooms WHERE id = p_room_id;
  SELECT count(*) INTO v_players_count FROM public.room_players WHERE room_id = p_room_id;

  FOR v_role, v_count IN
    SELECT key, value::int FROM jsonb_each_text(v_settings->'roles')
  LOOP
    FOR i IN 1..v_count LOOP
      v_role_pool := array_append(v_role_pool, v_role);
    END LOOP;
  END LOOP;

  WHILE array_length(v_role_pool, 1) < v_players_count LOOP
    v_role_pool := array_append(v_role_pool, 'villager');
  END LOOP;

  CREATE TEMPORARY TABLE tmp_shuffled_roles AS
    SELECT unnest(v_role_pool) AS role ORDER BY random();

  INSERT INTO public.game_sessions (room_id, phase, day_number, phase_ends_at)
  VALUES (p_room_id, 'night_intro', 1, now() + interval '8 seconds')
  RETURNING id INTO v_session_id;

  INSERT INTO public.game_players (session_id, profile_id, role)
  SELECT v_session_id, rp.profile_id, roles.role
  FROM (
    SELECT profile_id, row_number() OVER (ORDER BY random()) AS rn
    FROM public.room_players
    WHERE room_id = p_room_id
  ) rp
  JOIN (
    SELECT role, row_number() OVER () AS rn
    FROM tmp_shuffled_roles
  ) roles ON roles.rn = rp.rn;

  DROP TABLE tmp_shuffled_roles;

  UPDATE public.rooms SET status = 'playing' WHERE id = p_room_id;

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_room_for_rematch(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = p_room_id
      AND host_id = auth.uid()
      AND status = 'finished'
  ) THEN
    RAISE EXCEPTION 'Chỉ chủ phòng mới được reset phòng sau khi ván kết thúc';
  END IF;

  UPDATE public.rooms
  SET status = 'lobby'
  WHERE id = p_room_id;

  UPDATE public.room_players
  SET is_ready = (profile_id = (SELECT host_id FROM public.rooms WHERE id = p_room_id))
  WHERE room_id = p_room_id;
END;
$$;

-- Chỉ advance phase khi timer đã hết (tránh double-advance từ nhiều client)
CREATE OR REPLACE FUNCTION public.advance_phase(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text;
  v_day int;
  v_ends_at timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.game_players gp
    WHERE gp.session_id = p_session_id
      AND gp.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Bạn không tham gia ván đấu này';
  END IF;

  SELECT phase, day_number, phase_ends_at
  INTO v_current, v_day, v_ends_at
  FROM public.game_sessions
  WHERE id = p_session_id;

  IF v_current = 'game_over' THEN
    RETURN;
  END IF;

  -- Pha có timer: chỉ chuyển khi đã hết giờ (hoặc host gọi thủ công khi phase_ends_at null)
  IF v_ends_at IS NOT NULL AND v_ends_at > now() THEN
    RETURN;
  END IF;

  IF v_current = 'night_intro' THEN
    UPDATE public.game_sessions
    SET phase = 'night_actions', phase_ends_at = now() + interval '45 seconds'
    WHERE id = p_session_id;

  ELSIF v_current = 'night_actions' THEN
    PERFORM public.resolve_night(p_session_id);

  ELSIF v_current = 'day_result' THEN
    UPDATE public.game_sessions
    SET phase = 'day_discussion', phase_ends_at = now() + interval '90 seconds'
    WHERE id = p_session_id;

  ELSIF v_current = 'day_discussion' THEN
    UPDATE public.game_sessions
    SET phase = 'day_vote', phase_ends_at = now() + interval '30 seconds'
    WHERE id = p_session_id;

  ELSIF v_current = 'day_vote' THEN
    PERFORM public.resolve_vote(p_session_id);

  ELSIF v_current = 'day_vote_result' THEN
    UPDATE public.game_sessions
    SET phase = 'night_intro', day_number = v_day + 1, phase_ends_at = now() + interval '5 seconds'
    WHERE id = p_session_id
      AND NOT EXISTS (
        SELECT 1 FROM public.game_sessions WHERE id = p_session_id AND phase = 'game_over'
      );
  END IF;
END;
$$;

-- Cho phép người chơi trong phòng xem session game (kể cả spectator chưa có game_player)
CREATE POLICY "Xem session phòng đang chơi"
  ON public.game_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_players rp
      JOIN public.rooms r ON r.id = rp.room_id
      WHERE r.id = game_sessions.room_id
        AND rp.profile_id = auth.uid()
    )
  );

-- resolve_night: thêm timer tự chuyển sang thảo luận
CREATE OR REPLACE FUNCTION public.resolve_night(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day int;
  v_kill_target uuid;
  v_protected_target uuid;
  v_saved_target uuid;
  v_toxic_target uuid;
  v_victim uuid;
  v_dead_players uuid[] := '{}';
BEGIN
  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  SELECT target_id INTO v_kill_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'kill'
  GROUP BY target_id
  ORDER BY count(*) DESC
  LIMIT 1;

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

  IF v_kill_target IS NOT NULL THEN
    IF v_kill_target IS DISTINCT FROM v_protected_target AND v_kill_target IS DISTINCT FROM v_saved_target THEN
      v_dead_players := array_append(v_dead_players, v_kill_target);
    END IF;
  END IF;

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

-- resolve_vote: thêm timer tự chuyển sang đêm mới
CREATE OR REPLACE FUNCTION public.resolve_vote(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day int;
  v_hanged uuid;
  v_top_count int;
  v_second_count int;
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
    SELECT target_id, count(*) AS c
    FROM public.votes
    WHERE session_id = p_session_id AND day_number = v_day AND target_id IS NOT NULL
    GROUP BY target_id
    ORDER BY c DESC
    OFFSET 1 LIMIT 1
  ) t;

  IF v_top_count IS NOT NULL AND v_top_count = coalesce(v_second_count, -1) THEN
    v_hanged := null;
  END IF;

  IF v_hanged IS NOT NULL THEN
    UPDATE public.game_players
    SET is_alive = false, died_at_phase = 'day_vote', died_at_day = v_day
    WHERE id = v_hanged;

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
