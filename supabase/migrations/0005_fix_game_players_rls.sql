-- =====================================================================
-- 0005_fix_game_players_rls.sql
-- Sửa RLS policy cho game_players:
-- Tránh self-reference gây infinite recursion.
-- Dùng join qua game_sessions -> rooms -> room_players để kiểm tra tư cách.
-- =====================================================================

-- Xóa policy cũ (self-reference gây lỗi)
DROP POLICY IF EXISTS "Xem role có điều kiện" ON public.game_players;
DROP POLICY IF EXISTS "Xem danh sach nguoi choi trong session" ON public.game_players;

-- Policy mới: ai trong phòng (room_players) của session đó đều xem được danh sách
CREATE POLICY "Xem danh sach nguoi choi trong session"
  ON public.game_players FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.game_sessions gs
      JOIN public.room_players rp ON rp.room_id = gs.room_id
      WHERE gs.id = game_players.session_id
        AND rp.profile_id = auth.uid()
    )
  );
