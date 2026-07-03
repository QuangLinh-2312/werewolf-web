-- =====================================================================
-- 0007_pause_and_end_game.sql
-- Thêm phase 'paused', cột paused_phase, RPC pause/resume/end game
-- =====================================================================

-- 1. Mở rộng constraint phase để chấp nhận 'paused'
ALTER TABLE public.game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_phase_check;

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_phase_check
  CHECK (phase IN (
    'setup', 'night_intro', 'night_actions', 'night_resolve',
    'day_result', 'day_discussion', 'day_vote', 'day_vote_result',
    'game_over', 'paused'
  ));

-- 2. Thêm cột lưu pha trước khi tạm dừng
ALTER TABLE public.game_sessions
  ADD COLUMN IF NOT EXISTS paused_phase text;

-- 3. RPC pause_game — bất kỳ người chơi trong ván đều gọi được
CREATE OR REPLACE FUNCTION public.pause_game(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase text;
BEGIN
  -- Kiểm tra người gọi có trong ván không
  IF NOT EXISTS (
    SELECT 1 FROM public.game_players gp
    WHERE gp.session_id = p_session_id
      AND gp.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Bạn không tham gia ván đấu này';
  END IF;

  SELECT phase INTO v_phase
  FROM public.game_sessions
  WHERE id = p_session_id;

  IF v_phase = 'paused' THEN
    RAISE EXCEPTION 'Ván đấu đã đang tạm dừng';
  END IF;

  IF v_phase = 'game_over' THEN
    RAISE EXCEPTION 'Ván đấu đã kết thúc';
  END IF;

  UPDATE public.game_sessions
  SET
    paused_phase  = phase,
    phase         = 'paused',
    -- Đóng băng timer: lưu thời gian còn lại sẽ được phục hồi khi resume
    -- (đơn giản hoá: xoá timer, khi resume không có countdown)
    phase_ends_at = NULL
  WHERE id = p_session_id;
END;
$$;

-- 4. RPC resume_game — bất kỳ người chơi trong ván đều gọi được
CREATE OR REPLACE FUNCTION public.resume_game(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paused_phase text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.game_players gp
    WHERE gp.session_id = p_session_id
      AND gp.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Bạn không tham gia ván đấu này';
  END IF;

  SELECT paused_phase INTO v_paused_phase
  FROM public.game_sessions
  WHERE id = p_session_id AND phase = 'paused';

  IF v_paused_phase IS NULL THEN
    RAISE EXCEPTION 'Ván đấu không ở trạng thái tạm dừng';
  END IF;

  UPDATE public.game_sessions
  SET
    phase        = v_paused_phase,
    paused_phase = NULL
    -- Không khôi phục phase_ends_at — để pha tiếp tục không có deadline
    -- (host/tất cả có thể bấm advance_phase thủ công nếu cần)
  WHERE id = p_session_id;
END;
$$;

-- 5. RPC end_game — chỉ host mới gọi được
CREATE OR REPLACE FUNCTION public.end_game(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  SELECT room_id INTO v_room_id
  FROM public.game_sessions
  WHERE id = p_session_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = v_room_id AND host_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Chỉ chủ phòng mới được kết thúc ván';
  END IF;

  UPDATE public.game_sessions
  SET
    phase        = 'game_over',
    paused_phase = NULL,
    phase_ends_at = NULL,
    ended_at     = now()
  WHERE id = p_session_id;

  UPDATE public.rooms
  SET status = 'finished'
  WHERE id = v_room_id;
END;
$$;
