-- =====================================================================
-- 0002_stage4_roles.sql
-- Cập nhật logic các vai trò mở rộng: Bảo vệ, Phù thủy, Thợ săn, Cupid
-- =====================================================================

-- 1. Cập nhật Check Constraint cho bảng night_actions để chấp nhận hành động 'toxic' (đầu độc) và 'shoot' (thợ săn bắn)
ALTER TABLE public.night_actions DROP CONSTRAINT IF EXISTS night_actions_action_type_check;
ALTER TABLE public.night_actions ADD CONSTRAINT night_actions_action_type_check 
  CHECK (action_type IN ('kill', 'save', 'check', 'protect', 'link', 'toxic', 'shoot'));

-- RLS Policy: Cho phép Phù thủy còn sống xem nạn nhân bị cắn đêm nay để quyết định cứu
CREATE POLICY "Phu thuy xem muc tieu bi can"
  ON public.night_actions FOR SELECT
  USING (
    action_type = 'kill'
    AND EXISTS (
      SELECT 1 FROM public.game_players me
      WHERE me.session_id = night_actions.session_id
        AND me.profile_id = auth.uid()
        AND me.role = 'witch'
        AND me.is_alive = true
    )
  );

-- 2. RPC match_lovers: Cho phép Cupid ghép duyên chéo giữa 2 người chơi vào Đêm 1
CREATE OR REPLACE FUNCTION public.match_lovers(
  p_session_id uuid,
  p_lover1_profile_id uuid,
  p_lover2_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller public.game_players;
  v_lover1 public.game_players;
  v_lover2 public.game_players;
  v_day int;
BEGIN
  -- Lấy thông tin người gọi RPC
  SELECT * INTO v_caller 
  FROM public.game_players 
  WHERE session_id = p_session_id AND profile_id = auth.uid();
  
  IF v_caller.id IS NULL OR v_caller.role <> 'cupid' OR v_caller.is_alive = false THEN
    RAISE EXCEPTION 'Chỉ Cupid còn sống mới được phép ghép đôi tình nhân';
  END IF;

  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;
  IF v_day <> 1 THEN
    RAISE EXCEPTION 'Cupid chỉ được ghép tình nhân vào Đêm 1';
  END IF;

  -- Lấy thông tin 2 người chơi cần ghép đôi
  SELECT * INTO v_lover1 FROM public.game_players WHERE session_id = p_session_id AND profile_id = p_lover1_profile_id;
  SELECT * INTO v_lover2 FROM public.game_players WHERE session_id = p_session_id AND profile_id = p_lover2_profile_id;

  IF v_lover1.id IS NULL OR v_lover2.id IS NULL THEN
    RAISE EXCEPTION 'Chỉ định người chơi kết duyên không hợp lệ';
  END IF;

  -- Set link tình nhân chéo nhau
  UPDATE public.game_players SET lover_id = v_lover2.id WHERE id = v_lover1.id;
  UPDATE public.game_players SET lover_id = v_lover1.id WHERE id = v_lover2.id;

  -- Ghi nhận action tượng trưng
  INSERT INTO public.night_actions (session_id, day_number, actor_id, action_type, target_id)
  VALUES (p_session_id, v_day, v_caller.id, 'link', v_lover1.id)
  ON CONFLICT (session_id, day_number, actor_id, action_type)
  DO UPDATE SET target_id = v_lover1.id;
END;
$$;

-- 3. RPC hunter_shoot: Cho phép Thợ săn đã chết nổ súng kéo theo một người chơi khác
CREATE OR REPLACE FUNCTION public.hunter_shoot(
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
  v_day int;
BEGIN
  -- Lấy thông tin người thợ săn gọi nổ súng
  SELECT * INTO v_caller 
  FROM public.game_players 
  WHERE session_id = p_session_id AND profile_id = auth.uid();

  IF v_caller.id IS NULL OR v_caller.role <> 'hunter' THEN
    RAISE EXCEPTION 'Chỉ có Thợ săn mới gửi được lệnh nổ súng';
  END IF;

  -- Thợ săn phải chết mới được bắn
  IF v_caller.is_alive = true THEN
    RAISE EXCEPTION 'Thợ săn chỉ nổ súng phục hận khi đã bị hạ sát';
  END IF;

  -- Kiểm tra xem đã bắn lần nào trước đó chưa
  IF EXISTS (
    SELECT 1 FROM public.night_actions
    WHERE session_id = p_session_id AND actor_id = v_caller.id AND action_type = 'shoot'
  ) THEN
    RAISE EXCEPTION 'Thợ săn chỉ được nổ súng duy nhất một lần';
  END IF;

  -- Lấy mục tiêu
  SELECT * INTO v_target 
  FROM public.game_players 
  WHERE session_id = p_session_id AND profile_id = p_target_profile_id;

  IF v_target.id IS NULL OR v_target.is_alive = false THEN
    RAISE EXCEPTION 'Mục tiêu bắn không hợp lệ hoặc đã chết';
  END IF;

  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  -- Bắn chết nạn nhân
  UPDATE public.game_players
  SET is_alive = false, died_at_phase = 'hunter_shoot', died_at_day = v_day
  WHERE id = v_target.id;

  -- Xử lý chết chùm (tình nhân của nạn nhân bị bắn)
  UPDATE public.game_players lover
  SET is_alive = false, died_at_phase = 'hunter_shoot_lover', died_at_day = v_day
  FROM public.game_players victim
  WHERE victim.id = v_target.id
    AND lover.id = victim.lover_id
    AND lover.is_alive = true;

  -- Lưu vết hành động
  INSERT INTO public.night_actions (session_id, day_number, actor_id, action_type, target_id)
  VALUES (p_session_id, v_day, v_caller.id, 'shoot', v_target.id);

  -- Kiểm tra điều kiện thắng sau nổ súng
  PERFORM public.check_win_condition(p_session_id);
END;
$$;

-- 4. Viết lại resolve_night: Xử lý gộp cắn (Sói) + bảo vệ (Bảo vệ) + cứu/độc (Phù thủy) + chết chùm (Tình nhân)
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

  -- 1. Sói cắn
  SELECT target_id INTO v_kill_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'kill'
  GROUP BY target_id
  ORDER BY count(*) DESC
  LIMIT 1;

  -- 2. Bảo vệ hộ vệ
  SELECT target_id INTO v_protected_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'protect'
  LIMIT 1;

  -- 3. Phù thủy cứu
  SELECT target_id INTO v_saved_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'save'
  LIMIT 1;

  -- 4. Phù thủy độc
  SELECT target_id INTO v_toxic_target
  FROM public.night_actions
  WHERE session_id = p_session_id AND day_number = v_day AND action_type = 'toxic'
  LIMIT 1;

  -- Logic tính toán nạn nhân Sói cắn:
  -- Chỉ chết nếu có nạn nhân cắn và nạn nhân này KHÔNG TRÙNG với được bảo vệ, KHÔNG TRÙNG với được cứu.
  IF v_kill_target IS NOT NULL THEN
    IF v_kill_target IS DISTINCT FROM v_protected_target AND v_kill_target IS DISTINCT FROM v_saved_target THEN
      v_dead_players := array_append(v_dead_players, v_kill_target);
    END IF;
  END IF;

  -- Logic nạn nhân Phù thủy độc: Chết chắc chắn
  IF v_toxic_target IS NOT NULL THEN
    v_dead_players := array_append(v_dead_players, v_toxic_target);
  END IF;

  -- Thực thi khai tử các nạn nhân và kéo theo tình nhân của họ
  IF array_length(v_dead_players, 1) > 0 THEN
    FOREACH v_victim IN ARRAY v_dead_players LOOP
      UPDATE public.game_players
      SET is_alive = false, died_at_phase = 'night', died_at_day = v_day
      WHERE id = v_victim AND is_alive = true;

      -- Cupid tình nhân chết chùm
      UPDATE public.game_players lover
      SET is_alive = false, died_at_phase = 'night_lover', died_at_day = v_day
      FROM public.game_players victim
      WHERE victim.id = v_victim
        AND lover.id = victim.lover_id
        AND lover.is_alive = true;
    END LOOP;
  END IF;

  -- Chuyển pha
  UPDATE public.game_sessions
  SET phase = 'day_result', phase_ends_at = null
  WHERE id = p_session_id;

  PERFORM public.check_win_condition(p_session_id);
END;
$$;
