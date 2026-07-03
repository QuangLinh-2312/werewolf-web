-- =====================================================================
-- 0008_fix_resume_timer.sql
-- Sửa resume_game: khôi phục timer khi tiếp tục ván
-- =====================================================================

CREATE OR REPLACE FUNCTION public.resume_game(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paused_phase text;
  v_settings     jsonb;
  v_room_id      uuid;
  v_timer_night  int;
  v_timer_disc   int;
  v_timer_vote   int;
  v_new_ends_at  timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.game_players gp
    WHERE gp.session_id = p_session_id
      AND gp.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Bạn không tham gia ván đấu này';
  END IF;

  SELECT paused_phase, room_id
  INTO v_paused_phase, v_room_id
  FROM public.game_sessions
  WHERE id = p_session_id AND phase = 'paused';

  IF v_paused_phase IS NULL THEN
    RAISE EXCEPTION 'Ván đấu không ở trạng thái tạm dừng';
  END IF;

  -- Lấy timers từ room settings
  SELECT settings INTO v_settings FROM public.rooms WHERE id = v_room_id;
  v_timer_night := coalesce((v_settings->'timers'->>'night')::int, 45);
  v_timer_disc  := coalesce((v_settings->'timers'->>'discussion')::int, 90);
  v_timer_vote  := coalesce((v_settings->'timers'->>'vote')::int, 30);

  -- Tính lại phase_ends_at dựa trên pha đang phục hồi
  v_new_ends_at := CASE v_paused_phase
    WHEN 'night_intro'    THEN now() + interval '8 seconds'
    WHEN 'night_actions'  THEN now() + (v_timer_night  || ' seconds')::interval
    WHEN 'day_result'     THEN now() + interval '12 seconds'
    WHEN 'day_discussion' THEN now() + (v_timer_disc   || ' seconds')::interval
    WHEN 'day_vote'       THEN now() + (v_timer_vote   || ' seconds')::interval
    WHEN 'day_vote_result'THEN now() + interval '12 seconds'
    ELSE NULL  -- night_resolve, game_over — không có timer
  END;

  UPDATE public.game_sessions
  SET
    phase         = v_paused_phase,
    paused_phase  = NULL,
    phase_ends_at = v_new_ends_at
  WHERE id = p_session_id;
END;
$$;
