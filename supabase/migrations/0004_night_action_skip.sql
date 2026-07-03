-- Cho phép bỏ qua hành động ban đêm (Phù thủy skip cứu/độc) và validate vai trò
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
  v_actor public.game_players;
  v_target public.game_players;
  v_day int;
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
  IF p_action_type = 'kill' AND v_actor.role <> 'wolf' THEN
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

  INSERT INTO public.night_actions (session_id, day_number, actor_id, action_type, target_id)
  VALUES (p_session_id, v_day, v_actor.id, p_action_type, v_target_id)
  ON CONFLICT (session_id, day_number, actor_id, action_type)
  DO UPDATE SET target_id = EXCLUDED.target_id;
END;
$$;

-- Phù thủy xem nạn nhân bị cắn đêm nay
CREATE OR REPLACE FUNCTION public.get_wolf_kill_target(p_session_id uuid)
RETURNS TABLE (
  target_profile_id uuid,
  target_nickname text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.game_players gp
    WHERE gp.session_id = p_session_id
      AND gp.profile_id = auth.uid()
      AND gp.role = 'witch'
      AND gp.is_alive = true
  ) THEN
    RAISE EXCEPTION 'Chỉ Phù Thủy còn sống mới xem được thông tin này';
  END IF;

  SELECT day_number INTO v_day FROM public.game_sessions WHERE id = p_session_id;

  RETURN QUERY
  SELECT gp.profile_id, pr.nickname
  FROM public.night_actions na
  JOIN public.game_players gp ON gp.id = na.target_id
  JOIN public.profiles pr ON pr.id = gp.profile_id
  WHERE na.session_id = p_session_id
    AND na.day_number = v_day
    AND na.action_type = 'kill'
  ORDER BY na.created_at DESC
  LIMIT 1;
END;
$$;
