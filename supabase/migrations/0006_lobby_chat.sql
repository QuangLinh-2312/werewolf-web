-- =====================================================================
-- 0006_lobby_chat.sql
-- Thêm bảng lobby_messages để chat trong sảnh chờ (không cần game session)
-- =====================================================================

CREATE TABLE public.lobby_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lobby_messages ENABLE ROW LEVEL SECURITY;

-- Ai trong phòng cũng đọc được
CREATE POLICY "Đọc chat sảnh chờ nếu trong phòng"
  ON public.lobby_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.room_players rp
      WHERE rp.room_id = lobby_messages.room_id
        AND rp.profile_id = auth.uid()
    )
  );

-- Ai trong phòng cũng gửi được
CREATE POLICY "Gửi chat sảnh chờ nếu trong phòng"
  ON public.lobby_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.room_players rp
      WHERE rp.room_id = lobby_messages.room_id
        AND rp.profile_id = auth.uid()
    )
  );

-- Bật Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lobby_messages;
ALTER TABLE public.lobby_messages REPLICA IDENTITY FULL;

CREATE INDEX idx_lobby_messages_room ON public.lobby_messages(room_id, created_at);
