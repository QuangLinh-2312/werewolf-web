'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  Settings, Play, Users, MessageSquare, LogOut, Loader2,
  Copy, CheckCheck, Crown, Shield, Minus, Plus, Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PlayerList } from '@/components/room/PlayerList'
import { LobbyChatBox } from '@/components/room/LobbyChatBox'
import { useAuth } from '@/contexts/AuthContext'
import { useRoomRealtime, broadcastRoomEvent } from '@/hooks/useRoomRealtime'
import { createClient } from '@/lib/supabase/client'
import { CLASSIC_ROLES, EXTENDED_ROLES, getExtendedPreset } from '@/lib/game/roles'
import type { RoleKey, GameMode, RoomSettings } from '@/types/database.types'

const ROLE_LABELS: Record<string, { name: string; emoji: string; team: string; minPlayers?: number }> = {
  wolf:          { name: 'Ma Sói',         emoji: '🐺',   team: 'Phe Sói' },
  villager:      { name: 'Dân làng',       emoji: '👤',   team: 'Phe Dân' },
  seer:          { name: 'Tiên tri',       emoji: '🔮',   team: 'Phe Dân' },
  guard:         { name: 'Bảo vệ',         emoji: '🛡️',  team: 'Phe Dân' },
  witch:         { name: 'Phù thủy',       emoji: '🧪',   team: 'Phe Dân' },
  hunter:        { name: 'Thợ săn',        emoji: '🏹',   team: 'Phe Dân' },
  cupid:         { name: 'Cupid',           emoji: '💘',   team: 'Trung lập' },
  // Extended
  elder:         { name: 'Trưởng Làng',    emoji: '👴',   team: 'Phe Dân',    minPlayers: 8 },
  jester:        { name: 'Kẻ Điên',        emoji: '🃏',   team: 'Trung lập',  minPlayers: 8 },
  alpha_wolf:    { name: 'Sói Tiên Tri',   emoji: '🐺🔮', team: 'Phe Sói',   minPlayers: 8 },
  silencer:      { name: 'Phù Thủy Câm',   emoji: '🔇',   team: 'Phe Dân',    minPlayers: 8 },
  detective:     { name: 'Thám Tử',         emoji: '🕵️',  team: 'Phe Dân',    minPlayers: 8 },
  avenger_wolf:  { name: 'Sói Phục Hận',   emoji: '🐺💀', team: 'Phe Sói',   minPlayers: 12 },
  doppelganger:  { name: 'Kẻ Nhân Bản',    emoji: '🤡',   team: 'Trung lập',  minPlayers: 14 },
}

export default function LobbyPage() {
  const params = useParams()
  const router = useRouter()
  const { user, profile } = useAuth()
  const roomCode = (params?.roomCode as string)?.toUpperCase()
  const supabase = createClient()

  const { room, players, loading, error } = useRoomRealtime({
    roomCode,
    userId: user?.id,
  })

  const [startingGame, setStartingGame] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'players' | 'chat'>('players')
  const redirectedRef = useRef(false)

  // Settings state (host only)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [localSettings, setLocalSettings] = useState<RoomSettings | null>(null)

  // Sync localSettings khi room load
  useEffect(() => {
    if (room && !localSettings) {
      setLocalSettings(room.settings as RoomSettings)
    }
  }, [room?.id])

  // Tự động chuyển sang màn game khi host bắt đầu ván (realtime + polling)
  useEffect(() => {
    if (room?.status === 'playing' && !redirectedRef.current) {
      redirectedRef.current = true
      toast.success('Ván đấu bắt đầu! Đang vào bàn chơi...')
      router.push(`/room/${roomCode}/game`)
    }
  }, [room?.status, roomCode, router])

  const isHost = room?.host_id === user?.id
  const myPlayer = players.find((p) => p.profile_id === user?.id)
  const isReady = myPlayer?.is_ready ?? false
  const canStart = isHost && players.length >= 2 && players.every((p) => p.is_ready || p.profile_id === room?.host_id)

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleToggleReady = async () => {
    if (!myPlayer || !room) return
    await (supabase.from('room_players') as any)
      .update({ is_ready: !isReady })
      .eq('id', myPlayer.id)
    await broadcastRoomEvent(room.id, 'room_updated')
  }

  const handleStartGame = async () => {
    if (!room) return
    setStartingGame(true)
    try {
      const { data: sessionId, error } = await (supabase.rpc as any)('assign_roles', {
        p_room_id: room.id,
      })
      if (error) throw error
      await broadcastRoomEvent(room.id, 'game_started')
      toast.success('Ván đấu bắt đầu! Vai trò đã được phân công.')
      router.push(`/room/${roomCode}/game`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Không thể bắt đầu game'
      toast.error(msg)
    } finally {
      setStartingGame(false)
    }
  }

  const handleLeave = async () => {
    if (!myPlayer) return
    await (supabase.from('room_players') as any).delete().eq('id', myPlayer.id)
    router.push('/')
  }

  const handleKick = async (profileId: string) => {
    if (!room || !isHost) return
    const target = players.find((p) => p.profile_id === profileId)
    if (!target) return
    await (supabase.from('room_players') as any).delete().eq('id', target.id)
    toast.success('Đã kick người chơi')
  }

  const handleSaveSettings = async () => {
    if (!room || !localSettings) return
    setSavingSettings(true)
    try {
      await (supabase.from('rooms') as any)
        .update({ settings: localSettings })
        .eq('id', room.id)
      await broadcastRoomEvent(room.id, 'room_updated')
      toast.success('Đã lưu cài đặt')
      setSettingsOpen(false)
    } catch {
      toast.error('Không thể lưu cài đặt')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleModeChange = (mode: GameMode) => {
    if (!localSettings) return
    const preset = mode === 'extended' ? getExtendedPreset(players.length) : {}
    const baseRoles: Record<RoleKey, number> = {
      wolf: 2, villager: 0, seer: 1, guard: 1, witch: 1, hunter: 1, cupid: 0,
      elder: 0, jester: 0, alpha_wolf: 0, silencer: 0, detective: 0, avenger_wolf: 0, doppelganger: 0,
    }
    setLocalSettings({
      ...localSettings,
      mode,
      roles: mode === 'extended'
        ? { ...baseRoles, ...preset } as Record<RoleKey, number>
        : { wolf: 1, villager: 0, seer: 1, guard: 0, witch: 0, hunter: 0, cupid: 0, elder: 0, jester: 0, alpha_wolf: 0, silencer: 0, detective: 0, avenger_wolf: 0, doppelganger: 0 },
    })
  }

  const handleRoleCount = (role: RoleKey, delta: number) => {
    if (!localSettings) return
    const cur = localSettings.roles[role] ?? 0
    const next = Math.max(0, cur + delta)
    setLocalSettings({ ...localSettings, roles: { ...localSettings.roles, [role]: next } })
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    )
  }

  if (error || !room) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
        <p className="text-white/60">{error ?? 'Không tìm thấy phòng'}</p>
        <Button onClick={() => router.push('/')} variant="outline" className="border-white/10 text-white/60">
          Về trang chủ
        </Button>
      </div>
    )
  }

  // Phòng đã kết thúc ván — chờ host reset để chơi lại
  if (room.status === 'finished') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="text-5xl">🎉</span>
        <h2 className="text-xl font-bold text-white">Ván vừa kết thúc</h2>
        <p className="text-sm text-white/50 max-w-sm">
          {isHost
            ? 'Bấm "Chơi lại" để reset phòng và bắt đầu ván mới.'
            : 'Chờ chủ phòng reset phòng để chơi lại.'}
        </p>
        {isHost && (
          <Button
            onClick={async () => {
              await (supabase.rpc as any)('reset_room_for_rematch', { p_room_id: room.id })
              toast.success('Phòng đã sẵn sàng cho ván mới!')
            }}
            className="bg-purple-600 hover:bg-purple-500 font-semibold"
          >
            Chơi lại
          </Button>
        )}
        <Button
          onClick={() => router.push('/')}
          variant="outline"
          className="border-white/10 text-white/60"
        >
          Về trang chủ
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col max-w-2xl mx-auto px-4 py-4 gap-4">
      {/* Header */}
      <div className="glass rounded-2xl px-5 py-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-white">Sảnh chờ</span>
            <Badge
              className={`text-xs ${
                room.status === 'lobby'
                  ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}
            >
              {room.status === 'lobby' ? 'Chờ người chơi' : 'Đang chơi'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono font-bold tracking-widest text-purple-300">
              {roomCode}
            </span>
            <button
              onClick={handleCopyCode}
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              {copied ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-white/30 mt-0.5">Chia sẻ mã này với bạn bè</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Users className="w-4 h-4 text-white/40" />
          <span className="text-sm text-white/60">
            {players.length}/20
          </span>
        </div>
      </div>

      {/* Role settings (host only) */}
      {isHost && (
        <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
          <Shield className="w-4 h-4 text-purple-400 shrink-0" />
          <div className="flex-1 flex flex-wrap gap-2">
            {/* Mode badge */}
            <Badge className={`text-xs border ${
              (room.settings as RoomSettings).mode === 'extended'
                ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                : 'bg-white/5 text-white/50 border-white/10'
            }`}>
              {(room.settings as RoomSettings).mode === 'extended' ? '⚡ Mở rộng' : '🎮 Cổ điển'}
            </Badge>
            {Object.entries((room.settings as RoomSettings).roles)
              .filter(([, count]) => (count as number) > 0)
              .map(([role, count]) => (
                <Badge key={role} className="bg-white/5 border-white/10 text-white/60 text-xs">
                  {ROLE_LABELS[role]?.emoji} {ROLE_LABELS[role]?.name} ×{count as number}
                </Badge>
              ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-white/40 hover:text-white/70"
            onClick={() => {
              setLocalSettings(room.settings as RoomSettings)
              setSettingsOpen(true)
            }}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Settings Dialog */}
      {settingsOpen && localSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm px-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-white">Cấu hình ván chơi</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-white/40 hover:text-white text-xl leading-none">×</button>
            </div>

            {/* Mode selector */}
            <div className="mb-5">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Chế độ chơi</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleModeChange('classic')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    (localSettings.mode ?? 'classic') === 'classic'
                      ? 'border-purple-500/50 bg-purple-500/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
                  }`}
                >
                  <div className="text-lg mb-1">🎮</div>
                  <div className="text-xs font-bold">Cổ điển</div>
                  <div className="text-[10px] text-white/40">2–7 người · 7 vai</div>
                </button>
                <button
                  onClick={() => players.length >= 8 ? handleModeChange('extended') : toast.error('Cần ít nhất 8 người để dùng chế độ Mở rộng')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    localSettings.mode === 'extended'
                      ? 'border-violet-500/50 bg-violet-500/10 text-white'
                      : players.length >= 8
                        ? 'border-white/10 bg-white/5 text-white/50 hover:border-white/20'
                        : 'border-white/5 bg-white/3 text-white/20 cursor-not-allowed'
                  }`}
                >
                  <div className="text-lg mb-1">⚡</div>
                  <div className="text-xs font-bold">Mở rộng</div>
                  <div className="text-[10px] text-white/40">8+ người · 10 vai</div>
                </button>
              </div>
              {players.length < 8 && (
                <p className="text-[10px] text-white/30 mt-1.5">Chế độ Mở rộng cần ít nhất 8 người ({players.length}/8)</p>
              )}
            </div>

            {/* Role counts */}
            <div className="mb-5">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Số lượng vai</p>
              <div className="space-y-2">
                {(localSettings.mode === 'extended' ? EXTENDED_ROLES : CLASSIC_ROLES)
                  .filter(r => r !== 'villager')
                  .map((role) => {
                    const info = ROLE_LABELS[role]
                    const count = localSettings.roles[role] ?? 0
                    const isExtendedOnly = ['elder', 'jester', 'alpha_wolf', 'silencer', 'detective', 'avenger_wolf', 'doppelganger'].includes(role)
                    return (
                      <div key={role} className={`flex items-center justify-between p-2.5 rounded-xl ${
                        isExtendedOnly ? 'bg-violet-500/5 border border-violet-500/15' : 'bg-white/5 border border-white/5'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className="text-base">{info?.emoji}</span>
                          <div>
                            <span className="text-sm text-white font-medium">{info?.name}</span>
                            <span className={`text-[10px] ml-1.5 ${
                              info?.team === 'Phe Sói' ? 'text-red-400/70' :
                              info?.team === 'Trung lập' ? 'text-violet-400/70' :
                              'text-white/30'
                            }`}>{info?.team}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRoleCount(role, -1)}
                            disabled={count === 0}
                            className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-all"
                          >
                            <Minus className="w-3 h-3 text-white" />
                          </button>
                          <span className="text-sm font-bold text-white w-4 text-center">{count}</span>
                          <button
                            onClick={() => handleRoleCount(role, 1)}
                            className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                          >
                            <Plus className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Total check */}
            {(() => {
              const total = Object.values(localSettings.roles).reduce((a, b) => a + (b as number), 0)
              const diff = players.length - total
              return (
                <div className={`p-2.5 rounded-xl mb-4 text-xs flex items-center gap-2 ${
                  diff === 0 ? 'bg-green-500/10 border border-green-500/20 text-green-300' :
                  diff > 0  ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300' :
                              'bg-red-500/10 border border-red-500/20 text-red-300'
                }`}>
                  <span>{diff === 0 ? '✓' : diff > 0 ? '⚠' : '✗'}</span>
                  <span>
                    {diff === 0 ? `Đủ ${players.length} vai cho ${players.length} người` :
                     diff > 0  ? `Thiếu ${diff} vai (sẽ tự thêm Dân Làng)` :
                                 `Thừa ${-diff} vai — giảm bớt`}
                  </span>
                </div>
              )
            })()}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSettingsOpen(false)}
                className="flex-1 border-white/10 text-white/60"
              >
                Huỷ
              </Button>
              <Button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-semibold"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lưu cài đặt'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs: Players / Chat */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('players')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'players'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          <Users className="w-4 h-4" />
          Người chơi ({players.length})
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'chat'
              ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
              : 'text-white/40 hover:text-white/60'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Chat
        </button>
      </div>

      {/* Content */}
      <div className="glass rounded-2xl flex-1 overflow-hidden" style={{ minHeight: '300px' }}>
        {activeTab === 'players' ? (
          <div className="p-4">
            <PlayerList
              players={players}
              hostId={room.host_id}
              currentUserId={user?.id ?? ''}
            />
            {/* Host: kick buttons */}
            {isHost && (
              <div className="mt-3 space-y-1">
                {players
                  .filter((p) => p.profile_id !== user?.id)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-2">
                      <span className="text-xs text-white/30">{p.profiles?.nickname}</span>
                      <button
                        onClick={() => handleKick(p.profile_id)}
                        className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                      >
                        Kick
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className="h-80">
            <LobbyChatBox
              roomId={room.id}
              senderId={user?.id ?? ''}
              senderNickname={profile?.nickname ?? 'Player'}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={handleLeave}
          className="border border-white/10 text-white/40 hover:text-white hover:border-red-500/40 hover:text-red-400 gap-2"
        >
          <LogOut className="w-4 h-4" />
          Rời phòng
        </Button>

        <div className="flex-1" />

        {isHost ? (
          <div className="flex flex-col items-end gap-1">
            <Button
              onClick={handleStartGame}
              disabled={startingGame || !canStart}
              className={`gap-2 font-semibold px-6 ${
                canStart
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/10'
              }`}
            >
              {startingGame ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Bắt đầu ({players.length} người)
                </>
              )}
            </Button>
            {!canStart && !startingGame && (
              <p className="text-[10px] text-white/30 text-right">
                {players.length < 2
                  ? 'Cần ít nhất 2 người'
                  : 'Chờ tất cả người chơi sẵn sàng'}
              </p>
            )}
          </div>
        ) : (
          <Button
            onClick={handleToggleReady}
            className={`gap-2 font-semibold px-6 ${
              isReady
                ? 'bg-green-600/20 border border-green-500/40 text-green-300 hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-300'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
          >
            {isReady ? (
              <>✓ Sẵn sàng (Bấm để huỷ)</>
            ) : (
              <>Sẵn sàng</>
            )}
          </Button>
        )}
      </div>

      {/* Waiting hint */}
      {!canStart && players.length >= 2 && isHost && (
        <p className="text-center text-xs text-white/25">
          {players.filter((p) => !p.is_ready && p.profile_id !== room?.host_id).length} người chưa sẵn sàng
        </p>
      )}
      {players.length < 2 && (
        <p className="text-center text-xs text-white/25">
          Cần ít nhất 2 người để bắt đầu ván · Hiện có {players.length} người
        </p>
      )}
    </div>
  )
}
