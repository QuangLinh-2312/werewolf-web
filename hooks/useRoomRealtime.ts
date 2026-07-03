'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { RoomPlayerWithProfile, Room } from '@/types/database.types'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseRoomRealtimeOptions {
  roomCode: string
  userId: string | undefined
}

interface RoomRealtimeState {
  room: Room | null
  players: RoomPlayerWithProfile[]
  loading: boolean
  error: string | null
}

const POLL_INTERVAL_MS = 3000

export function useRoomRealtime({ roomCode, userId }: UseRoomRealtimeOptions): RoomRealtimeState {
  const [state, setState] = useState<RoomRealtimeState>({
    room: null,
    players: [],
    loading: true,
    error: null,
  })
  const channelRef = useRef<RealtimeChannel | null>(null)
  const roomIdRef = useRef<string | null>(null)
  const supabase = createClient()

  const fetchPlayers = useCallback(async (roomId: string) => {
    const { data: players, error } = await (supabase as any)
      .from('room_players')
      .select('*, profiles(*)')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true })

    if (!error) {
      setState((s) => ({
        ...s,
        players: (players as unknown as RoomPlayerWithProfile[]) ?? [],
      }))
    }
  }, [supabase])

  const fetchRoom = useCallback(async (roomId: string) => {
    const { data: room, error } = await (supabase as any)
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (!error && room) {
      setState((s) => ({ ...s, room: room as Room }))
    }
  }, [supabase])

  useEffect(() => {
    if (!userId) return

    let active = true
    let pollInterval: ReturnType<typeof setInterval> | null = null

    const setup = async () => {
      const { data: room, error: roomError } = await (supabase as any)
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .single()

      if (!active) return

      if (roomError || !room) {
        setState({ room: null, players: [], loading: false, error: 'Không tìm thấy phòng' })
        return
      }

      const roomId = (room as Room).id
      roomIdRef.current = roomId

      const { error: upsertError } = await (supabase as any)
        .from('room_players')
        .upsert(
          { room_id: roomId, profile_id: userId, is_connected: true },
          { onConflict: 'room_id,profile_id' }
        )

      if (upsertError) {
        console.error('Error joining room:', upsertError)
        toast.error(`Lỗi tham gia phòng: ${upsertError.message}`)
      }

      const { data: players, error: playersError } = await (supabase as any)
        .from('room_players')
        .select('*, profiles(*)')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true })

      if (!active) return

      if (playersError) {
        setState((s) => ({ ...s, error: 'Lỗi tải danh sách người chơi', loading: false }))
        return
      }

      setState({
        room: room as Room,
        players: (players as unknown as RoomPlayerWithProfile[]) ?? [],
        loading: false,
        error: null,
      })

      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current)
      }

      const channel = supabase
        .channel(`room:${roomId}`, { config: { broadcast: { self: true } } })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_players',
            filter: `room_id=eq.${roomId}`,
          },
          () => {
            fetchPlayers(roomId)
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            setState((s) => ({ ...s, room: payload.new as Room }))
          }
        )
        .on('broadcast', { event: 'game_started' }, () => {
          fetchRoom(roomId)
        })
        .on('broadcast', { event: 'room_updated' }, () => {
          fetchPlayers(roomId)
          fetchRoom(roomId)
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[realtime] Channel error — dùng polling fallback')
          }
        })

      channelRef.current = channel

      // Polling fallback: đảm bảo UI cập nhật ngay cả khi Realtime chưa bật trên Supabase
      pollInterval = setInterval(() => {
        if (roomIdRef.current) {
          fetchPlayers(roomIdRef.current)
          fetchRoom(roomIdRef.current)
        }
      }, POLL_INTERVAL_MS)
    }

    setup()

    return () => {
      active = false
      if (pollInterval) clearInterval(pollInterval)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [roomCode, userId, supabase, fetchPlayers, fetchRoom])

  return state
}

/** Gửi broadcast tới tất cả client trong phòng */
export async function broadcastRoomEvent(
  roomId: string,
  event: 'game_started' | 'room_updated',
  payload: Record<string, unknown> = {}
) {
  const supabase = createClient()
  const channel = supabase.channel(`room:${roomId}`, {
    config: { broadcast: { self: true } },
  })
  await channel.subscribe()
  await channel.send({ type: 'broadcast', event, payload })
  await supabase.removeChannel(channel)
}
