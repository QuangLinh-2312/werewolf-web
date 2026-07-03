'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  GameSession,
  GamePlayer,
  Profile,
  Vote,
  NightAction,
  NightActionType,
} from '@/types/database.types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type GamePlayerWithProfile = GamePlayer & {
  profiles: Profile
}

interface GameContextValue {
  session: GameSession | null
  me: GamePlayer | null
  players: GamePlayerWithProfile[]
  votes: Vote[]
  activeActions: NightAction[]
  loading: boolean
  error: string | null
  submitAction: (actionType: NightActionType, targetProfileId: string | null) => Promise<void>
  submitVote: (targetPlayerId: string | null) => Promise<void>
  advancePhase: () => Promise<void>
  pauseGame: () => Promise<void>
  resumeGame: () => Promise<void>
  endGame: () => Promise<void>
}

const GameContext = createContext<GameContextValue | null>(null)

const GAME_POLL_INTERVAL_MS = 3000

export function GameProvider({
  roomCode,
  userId,
  children,
}: {
  roomCode: string
  userId: string
  children: ReactNode
}) {
  const [session, setSession] = useState<GameSession | null>(null)
  const [me, setMe] = useState<GamePlayer | null>(null)
  const [players, setPlayers] = useState<GamePlayerWithProfile[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [activeActions, setActiveActions] = useState<NightAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const roomIdRef = useRef<string | null>(null)
  // Dùng ref để tránh tạo supabase client mới mỗi render
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const loadGameData = useCallback(async (roomId: string, sessionId: string) => {
    try {
      const { data: sess, error: sErr } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
      if (sErr || !sess) throw new Error('Không tìm thấy game session')
      setSession(sess as GameSession)

      const currentDay = (sess as GameSession).day_number

      const { data: pList, error: pErr } = await supabase
        .from('game_players')
        .select('*, profiles(*)')
        .eq('session_id', sessionId)
      if (pErr) throw new Error('Lỗi load danh sách người chơi')

      const pListData = (pList as GamePlayerWithProfile[]) ?? []
      setPlayers(pListData)

      const myPl = pListData.find((p) => p.profile_id === userId)
      setMe((myPl as GamePlayer) ?? null)

      const { data: vList } = await supabase
        .from('votes')
        .select('*')
        .eq('session_id', sessionId)
        .eq('day_number', currentDay)
      setVotes((vList as Vote[]) ?? [])

      const { data: actList } = await supabase
        .from('night_actions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('day_number', currentDay)
      setActiveActions((actList as NightAction[]) ?? [])

      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu game')
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    let active = true
    let pollInterval: ReturnType<typeof setInterval> | null = null

    const initConnection = async () => {
      const { data: room, error: rErr } = await (supabase as any)
        .from('rooms')
        .select('id, status')
        .eq('code', roomCode)
        .single()

      if (!active) return

      if (rErr || !room) {
        setError('Không tìm thấy phòng chơi')
        setLoading(false)
        return
      }

      const roomId = (room as { id: string }).id
      roomIdRef.current = roomId

      if ((room as { status: string }).status === 'lobby') {
        setError('Ván chưa bắt đầu — quay lại sảnh chờ')
        setLoading(false)
        return
      }

      const { data: sess, error: sErr } = await (supabase as any)
        .from('game_sessions')
        .select('*')
        .eq('room_id', roomId)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      if (!active) return

      if (sErr || !sess) {
        setError('Hiện chưa có ván đấu nào được khởi chạy')
        setLoading(false)
        return
      }

      const sessionId = (sess as GameSession).id
      sessionIdRef.current = sessionId

      await loadGameData(roomId, sessionId)

      if (!active) return

      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current)
      }

      const refresh = () => {
        const sid = sessionIdRef.current
        const rid = roomIdRef.current
        if (sid && rid) loadGameData(rid, sid)
      }

      const channel = supabase
        .channel(`game:${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'game_sessions',
            filter: `id=eq.${sessionId}`,
          },
          (payload) => {
            setSession(payload.new as GameSession)
            refresh()
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'game_players',
            filter: `session_id=eq.${sessionId}`,
          },
          refresh
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'votes',
            filter: `session_id=eq.${sessionId}`,
          },
          refresh
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'night_actions',
            filter: `session_id=eq.${sessionId}`,
          },
          refresh
        )
        .subscribe()

      if (active) {
        channelRef.current = channel
      } else {
        supabase.removeChannel(channel)
      }

      pollInterval = setInterval(() => {
        refresh()
      }, GAME_POLL_INTERVAL_MS)
    }

    initConnection()

    return () => {
      active = false
      if (pollInterval) clearInterval(pollInterval)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [roomCode, loadGameData, supabase])

  const submitAction = async (actionType: NightActionType, targetProfileId: string | null) => {
    if (!session) return
    try {
      const { error: aErr } = await (supabase.rpc as any)('submit_night_action', {
        p_session_id: session.id,
        p_action_type: actionType,
        p_target_profile_id: targetProfileId,
      })
      if (aErr) throw new Error(aErr.message)
    } catch (e: unknown) {
      console.error('Submit action error:', e)
      throw e
    }
  }

  const submitVote = async (targetPlayerId: string | null) => {
    if (!session || !me) return
    try {
      const { error: vErr } = await supabase
        .from('votes')
        .upsert({
          session_id: session.id,
          day_number: session.day_number,
          voter_id: me.id,
          target_id: targetPlayerId,
        } as any, {
          onConflict: 'session_id,day_number,voter_id',
        })
      if (vErr) throw new Error(vErr.message)
    } catch (e: unknown) {
      console.error('Submit vote error:', e)
      throw e
    }
  }

  const advancePhase = async () => {
    if (!session) return
    try {
      const { error: pErr } = await (supabase.rpc as any)('advance_phase', {
        p_session_id: session.id,
      })
      if (pErr) throw new Error(pErr.message)
    } catch (e: unknown) {
      console.error('Advance phase error:', e)
    }
  }

  const pauseGame = async () => {
    if (!session) return
    try {
      const { error: pErr } = await (supabase.rpc as any)('pause_game', {
        p_session_id: session.id,
      })
      if (pErr) throw new Error(pErr.message)
    } catch (e: unknown) {
      console.error('Pause game error:', e)
      throw e
    }
  }

  const resumeGame = async () => {
    if (!session) return
    try {
      const { error: pErr } = await (supabase.rpc as any)('resume_game', {
        p_session_id: session.id,
      })
      if (pErr) throw new Error(pErr.message)
    } catch (e: unknown) {
      console.error('Resume game error:', e)
      throw e
    }
  }

  const endGame = async () => {
    if (!session) return
    try {
      const { error: pErr } = await (supabase.rpc as any)('end_game', {
        p_session_id: session.id,
      })
      if (pErr) throw new Error(pErr.message)
    } catch (e: unknown) {
      console.error('End game error:', e)
      throw e
    }
  }

  return (
    <GameContext.Provider
      value={{
        session,
        me,
        players,
        votes,
        activeActions,
        loading,
        error,
        submitAction,
        submitVote,
        advancePhase,
        pauseGame,
        resumeGame,
        endGame,
      }}
    >
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame phải được dùng trong GameProvider')
  return ctx
}
