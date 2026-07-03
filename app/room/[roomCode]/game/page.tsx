'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  Users,
  MessageSquare,
  ShieldAlert,
  Moon,
  Sun,
  Skull,
  Award,
  ArrowLeft,
  Crosshair,
  Loader2,
  Pause,
  Play,
  StopCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { GameProvider, useGame } from '@/contexts/GameContext'
import { useAuth } from '@/contexts/AuthContext'
import { PhaseTimer } from '@/components/game/PhaseTimer'
import { RoleCard } from '@/components/game/RoleCard'
import { PlayerActionHub } from '@/components/game/PlayerActionHub'
import { ChatBox } from '@/components/room/ChatBox'
import { AnimatedPhase } from '@/components/game/AnimatedPhase'
import { getRoleDefinition } from '@/lib/game/roles'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { ChatChannel, GamePhase } from '@/types/database.types'

function GameInner() {
  const router = useRouter()
  const { user } = useAuth()
  const { session, me, players, error, loading, pauseGame, resumeGame, endGame } = useGame()
  const [activeTab, setActiveTab] = useState<'status' | 'players' | 'chat'>('status')
  const [showRoleInfo, setShowRoleInfo] = useState(false)
  const [pauseLoading, setPauseLoading] = useState(false)
  const [endLoading, setEndLoading] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const roomCode = (useParams()?.roomCode as string)?.toUpperCase()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  const [roomHostId, setRoomHostId] = useState<string | null>(null)

  useEffect(() => {
    const loadHost = async () => {
      const { data } = await (supabase as any)
        .from('rooms')
        .select('host_id')
        .eq('code', roomCode)
        .single()
      if (data) setRoomHostId((data as { host_id: string }).host_id)
    }
    loadHost()
  }, [roomCode, supabase])

  const isHost = roomHostId === user?.id

  // Thợ săn state
  const [hunterShot, setHunterShot] = useState(false)
  const [checkingHunter, setCheckingHunter] = useState(true)
  const [submittingHunter, setSubmittingHunter] = useState(false)

  // 1. Kiểm tra xem Thợ săn đã nổ súng chưa khi Thợ săn bị hạ sát
  useEffect(() => {
    if (!me || me.role !== 'hunter' || !session) {
      setCheckingHunter(false)
      return
    }
    const checkShot = async () => {
      try {
        const { data, error } = await supabase
          .from('night_actions')
          .select('id')
          .eq('session_id', session.id)
          .eq('actor_id', me.id)
          .eq('action_type', 'shoot')
        if (error) throw error
        setHunterShot(data && data.length > 0)
      } catch (e) {
        console.error('Lỗi kiểm tra trạng thái bắn của Thợ săn:', e)
      } finally {
        setCheckingHunter(false)
      }
    }
    checkShot()
  }, [me?.id, session?.id, me?.role, supabase])

  // Tự chuyển tab Trạng thái chỉ khi phase thay đổi, không phải khi poll
  const prevPhaseRef = useRef<string | null>(null)
  useEffect(() => {
    if (!session || !me) return
    const actionable = ['night_actions', 'day_discussion', 'day_vote']
    // Chỉ chuyển tab khi phase thực sự thay đổi (không chạy lại mỗi lần poll)
    if (actionable.includes(session.phase) && prevPhaseRef.current !== session.phase) {
      setActiveTab('status')
    }
    prevPhaseRef.current = session.phase
  }, [session?.phase])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 text-sm">Đang tải bàn chơi...</p>
        </div>
      </div>
    )
  }

  // Chấp nhận Spectator: bypass lỗi nếu me = null (là spectator)
  if (error || !session) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-white/60 max-w-sm">
          {error ?? 'Không thể tải bàn chơi.'}
        </p>
        <Button
          onClick={() => router.push(`/room/${roomCode}/lobby`)}
          variant="outline"
          className="border-white/10 text-white/60"
        >
          Trở về sảnh chờ
        </Button>
      </div>
    )
  }

  // Spectator setup giả lập 'me'
  const isSpectator = !me
  const mePlayer = me || {
    role: 'spectator',
    is_alive: false,
    profile_id: user?.id
  } as any

  const isAlive = mePlayer.is_alive
  const myRole = mePlayer.role
  const roleInfo = getRoleDefinition(isSpectator ? 'villager' : myRole)

  const handleHunterShoot = async (targetProfileId: string) => {
    setSubmittingHunter(true)
    try {
      const { error } = await (supabase.rpc as any)('hunter_shoot', {
        p_session_id: session.id,
        p_target_profile_id: targetProfileId,
      })
      if (error) throw error
      toast.success('PẰNG! Bạn đã nổ súng phục hận thành công!')
      setHunterShot(true)
    } catch (e: any) {
      toast.error(e.message || 'Bắn thất bại')
    } finally {
      setSubmittingHunter(false)
    }
  }

  const handleTogglePause = async () => {
    setPauseLoading(true)
    try {
      if (session?.phase === 'paused') {
        await resumeGame()
        toast.success('Ván đấu tiếp tục!')
      } else {
        await pauseGame()
        toast.success('Đã tạm dừng ván đấu')
      }
    } catch (e: any) {
      toast.error(e.message || 'Thao tác thất bại')
    } finally {
      setPauseLoading(false)
    }
  }

  const handleEndGame = async () => {
    setEndLoading(true)
    try {
      await endGame()
      toast.success('Đã kết thúc ván đấu')
      setShowEndConfirm(false)
    } catch (e: any) {
      toast.error(e.message || 'Không thể kết thúc ván')
    } finally {
      setEndLoading(false)
    }
  }

  const getPhaseHeadline = (phase: GamePhase) => {
    switch (phase) {
      case 'night_intro':
        return 'Đêm Xuống 🌙'
      case 'night_actions':
        return 'Thành Viên Đặc Biệt Hành Động 🔮'
      case 'night_resolve':
        return 'Đang Tổng Hợp Kết Quả Đêm...'
      case 'day_result':
        return 'Bình Minh Lên ☀️'
      case 'day_discussion':
        return 'Thảo Luận Ban Ngày 🗣️'
      case 'day_vote':
        return 'Bỏ Phiếu Treo Cổ ⚖️'
      case 'day_vote_result':
        return 'Kết Quả Bỏ Phiếu'
      case 'game_over':
        return 'Trò Chơi Kết Thúc 🎉'
      default:
        return 'Trò Chơi Bắt Đầu'
    }
  }

  const getPhaseDescription = (phase: GamePhase) => {
    switch (phase) {
      case 'night_intro':
        return 'Tất cả mọi người nhắm mắt ngủ. Chuẩn bị cho đêm đầy sóng gió.'
      case 'night_actions':
        return 'Ma Sói đang bàn bạc. Bảo vệ, Phù thủy, Cupid đang thức giấc làm nhiệm vụ.'
      case 'day_result':
        return 'Ánh mặt trời soi chiếu dân làng. Hãy kiểm tra xem ai còn sống sót.'
      case 'day_discussion':
        return 'Mọi người thảo luận tìm ra ai là Ma Sói đang trà trộn.'
      case 'day_vote':
        return 'Chọn người nghi ngờ nhất để treo cổ. Bạn có thể bỏ phiếu trắng.'
      case 'day_vote_result':
        return 'Người nhận nhiều vote nhất sẽ bị xử tử.'
      case 'game_over':
        if (session.winner === 'jester') return 'Kẻ Điên thắng cuộc! 🃏'
        return session.winner === 'wolves' ? 'Phe Ma Sói thắng cuộc!' : 'Phe Dân Làng thắng cuộc!'
      default:
        return ''
    }
  }

  // Quyết định channel chat mặc định
  let chatChannel: ChatChannel = 'public'
  if (isSpectator || !isAlive) {
    chatChannel = 'ghost'
  } else if (session.phase === 'night_actions' && ['wolf', 'alpha_wolf', 'avenger_wolf'].includes(myRole)) {
    chatChannel = 'wolves'
  }

  // Liệt kê người chơi còn sống (Thợ săn bắn)
  const otherLivingPlayers = players.filter((p) => p.profile_id !== user?.id && p.is_alive)

  return (
    <div className="min-h-dvh flex flex-col max-w-2xl mx-auto px-4 py-4 gap-4">
      {/* Phase transition overlay */}
      <AnimatedPhase phase={session.phase} />

      {/* Paused overlay */}
      {session.phase === 'paused' && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
              <Pause className="w-8 h-8 text-yellow-400" />
            </div>
            <h2 className="text-2xl font-black text-white">Tạm Dừng</h2>
            <p className="text-sm text-white/50">Ván đấu đang tạm dừng</p>
            <Button
              onClick={handleTogglePause}
              disabled={pauseLoading}
              className="mt-2 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 font-bold px-8 gap-2"
            >
              {pauseLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Tiếp tục ván
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* End game confirm dialog */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm px-4">
          <div className="glass rounded-2xl p-6 max-w-sm w-full border border-red-500/20 bg-red-950/10">
            <h3 className="text-lg font-bold text-white mb-2">Kết thúc ván?</h3>
            <p className="text-sm text-white/50 mb-5">
              Hành động này sẽ kết thúc ván đấu ngay lập tức và không thể hoàn tác. Không có người thắng được ghi nhận.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 border-white/10 text-white/60"
              >
                Huỷ
              </Button>
              <Button
                onClick={handleEndGame}
                disabled={endLoading}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold"
              >
                {endLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kết thúc ngay'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="glass rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => router.push(`/room/${roomCode}/lobby`)}
            className="w-8 h-8 text-white/50 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <span className="text-xs text-white/40 block">Phòng {roomCode}</span>
            <span className="text-sm font-bold text-white">Ngày {session.day_number}</span>
          </div>
        </div>

        {/* Phase State & Timer + Controls */}
        <div className="flex items-center gap-2">
          <Badge
            className={`text-xs capitalize py-1 px-3 ${
              session.phase === 'paused'
                ? 'bg-yellow-950/40 text-yellow-300 border-yellow-800/40'
                : session.phase.startsWith('night')
                ? 'bg-blue-950/40 text-blue-300 border-blue-800/40'
                : 'bg-amber-950/40 text-amber-300 border-amber-800/40'
            }`}
          >
            {session.phase === 'paused' ? (
              <Pause className="w-3 h-3 mr-1 inline" />
            ) : session.phase.includes('night') ? (
              <Moon className="w-3 h-3 mr-1 inline" />
            ) : (
              <Sun className="w-3 h-3 mr-1 inline" />
            )}
            {session.phase === 'paused' ? 'Tạm dừng' : `Pha ${session.phase.replace('_', ' ')}`}
          </Badge>
          <PhaseTimer />

          {/* Nút tạm dừng / tiếp tục — tất cả người chơi */}
          {session.phase !== 'game_over' && (
            <Button
              size="icon"
              variant="ghost"
              onClick={handleTogglePause}
              disabled={pauseLoading}
              title={session.phase === 'paused' ? 'Tiếp tục' : 'Tạm dừng'}
              className={`w-8 h-8 ${
                session.phase === 'paused'
                  ? 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {pauseLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : session.phase === 'paused' ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </Button>
          )}

          {/* Nút kết thúc ván — chỉ host */}
          {isHost && session.phase !== 'game_over' && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowEndConfirm(true)}
              title="Kết thúc ván"
              className="w-8 h-8 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Board Panel */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Status / Role Info Card */}
        <div className="bg-gradient-to-r from-purple-950/20 to-zinc-900/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 border border-purple-500/20">
              <AvatarFallback className="bg-purple-950 text-purple-300 font-bold">
                {myRole[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <span className="text-[10px] text-white/30 tracking-widest uppercase block font-semibold">
                VAI TRÒ VÁN ĐẤU
              </span>
              <span className="text-sm font-extrabold text-purple-300">
                {isSpectator ? 'Người xem 👁️' : `${roleInfo.name} ${roleInfo.emoji}`}
              </span>
            </div>
          </div>
          {!isSpectator && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRoleInfo(!showRoleInfo)}
              className="border-white/10 text-white/60 text-xs px-3 h-8 bg-zinc-950/40"
            >
              {showRoleInfo ? 'Ẩn thông tin' : 'Xem thẻ bài'}
            </Button>
          )}
        </div>

        {showRoleInfo && !isSpectator && (
          <div className="py-2 animate-in fade-in slide-in-from-top-4 duration-300">
            <RoleCard roleKey={myRole} defaultRevealed />
          </div>
        )}

        {/* Tab Controls */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('status')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'status'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            Trạng thái ván
          </button>
          <button
            onClick={() => setActiveTab('players')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'players'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Users className="w-4 h-4" />
            Mọi người ({players.filter((p) => p.is_alive).length}/{players.length})
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
            Bảng trò chuyện
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="glass rounded-2xl flex-1 flex flex-col overflow-hidden min-h-[360px]">
          {activeTab === 'status' && (
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-black text-white tracking-wide mb-1">
                    {getPhaseHeadline(session.phase)}
                  </h2>
                  <p className="text-xs text-white/50 leading-relaxed mb-4">
                    {getPhaseDescription(session.phase)}
                  </p>
                </div>

                {/* THỢ SĂN NỔ SÚNG PHỤC HẬN PANEL */}
                {myRole === 'hunter' && !isAlive && !checkingHunter && !hunterShot && (
                  <Card className="p-5 border-amber-500/30 bg-amber-950/10 rounded-2xl flex flex-col">
                    <div className="flex items-center gap-2.5 mb-3 text-amber-400">
                      <Crosshair className="w-6 h-6 animate-pulse" />
                      <h4 className="font-bold text-sm">Thợ Săn Nổ Súng Phục Hận</h4>
                    </div>
                    <p className="text-xs text-white/60 mb-4 leading-relaxed">
                      Bạn đã bị sát hại! Trước khi chết hoàn toàn, bạn có quyền bắn 1 phát súng kéo theo bất kỳ người chơi nào còn sống.
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {otherLivingPlayers.map((tgt) => (
                        <div key={tgt.id} className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5">
                          <span className="text-xs text-white">{tgt.profiles?.nickname}</span>
                          <Button
                            size="sm"
                            disabled={submittingHunter}
                            onClick={() => handleHunterShoot(tgt.profile_id)}
                            className="bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold h-7 px-3"
                          >
                            {submittingHunter ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Bắn'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Hub hành động theo pha — ban đêm, thảo luận, vote */}
                {!isSpectator && session.phase !== 'game_over' && (
                  <PlayerActionHub />
                )}

                {session.phase === 'game_over' && (
                  <div className="flex flex-col items-center justify-center p-6 border border-purple-500/20 bg-purple-500/5 rounded-2xl">
                    <Award className="w-14 h-14 text-amber-400 mb-3 animate-bounce" />
                    <h3 className="text-lg font-bold text-white">Trận Đấu Đã Kết Thúc!</h3>
                    <p className="text-xs text-white/50 mb-4">
                      {session.winner === 'jester'
                        ? 'Kẻ Điên đã bị treo cổ và thắng cuộc! 🃏'
                        : session.winner === 'wolves'
                        ? 'Chiến thắng vẻ vang thuộc về Phe Ma Sói 🐺'
                        : 'Chiến thắng vẻ vang thuộc về Phe Dân Làng 👤'}
                    </p>
                    <Button
                      onClick={async () => {
                        const { data: roomRow } = await (supabase as any)
                          .from('rooms')
                          .select('id, host_id')
                          .eq('code', roomCode)
                          .single()
                        if (roomRow && roomRow.host_id === user?.id) {
                          await (supabase.rpc as any)('reset_room_for_rematch', {
                            p_room_id: roomRow.id,
                          })
                        }
                        router.push(`/room/${roomCode}/lobby`)
                      }}
                      className="bg-purple-600 hover:bg-purple-500 font-semibold"
                    >
                      Về sảnh chờ {isHost ? '(Chơi lại)' : ''}
                    </Button>
                  </div>
                )}

                {session.phase === 'night_actions' && isSpectator && (
                  <div className="text-center p-8 bg-white/5 rounded-2xl">
                    <p className="text-xs text-white/40">Game đang trong pha ban đêm. Người chơi đặc biệt đang hành động.</p>
                  </div>
                )}

                {session.phase === 'day_vote' && isSpectator && (
                  <div className="text-center p-8 bg-white/5 rounded-2xl">
                    <p className="text-xs text-white/40">Dân làng đang bỏ phiếu treo cổ. Vui lòng chờ kết quả.</p>
                  </div>
                )}

              </div>

              {/* Status footer warnings */}
              {!isSpectator && !isAlive && (
                <div className="mt-6 p-3 bg-red-950/20 border border-red-900/30 rounded-xl flex items-center gap-2.5 text-red-300">
                  <Skull className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">
                    Bạn đã chết. Bạn chỉ có thể quan sát và chat trong kênh Linh Hồn (Ghost).
                  </span>
                </div>
              )}
              {isSpectator && (
                <div className="mt-6 p-3 bg-purple-950/20 border border-purple-900/30 rounded-xl flex items-center gap-2.5 text-purple-300">
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">
                    Bạn đang ở chế độ Người xem (Spectator). Kênh chat Linh Hồn đã được kích hoạt.
                  </span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'players' && (
            <div className="p-4 flex-grow space-y-2 overflow-y-auto max-h-[460px]">
              {players.map((p) => {
                const nickname = p.profiles?.nickname ?? 'Player'
                const isMe = p.profile_id === user?.id

                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      p.is_alive
                        ? 'border-white/5 bg-white/5'
                        : 'border-red-950/20 bg-red-950/10 opacity-55'
                    }`}
                  >
                    <Avatar className="w-8 h-8 border border-white/5 shrink-0">
                      <AvatarFallback className="bg-zinc-800 text-white text-xs">
                        {nickname[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-medium truncate ${p.is_alive ? 'text-white' : 'text-white/40 line-through'}`}>
                          {nickname}
                        </span>
                        {isMe && <span className="text-[10px] text-purple-400 font-semibold">(bạn)</span>}
                        
                        {/* Hiện vai của người chơi khi Game Over cho Spectator hoặc tất cả người chơi */}
                        {session.phase === 'game_over' && (
                          <Badge variant="secondary" className="text-[9px] h-4 py-0 bg-white/10 text-white/60">
                            {p.role}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      {p.is_alive ? (
                        <Badge variant="outline" className="border-green-500/20 bg-green-500/10 text-green-400 text-[10px] h-5">
                          Sống
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-500/20 bg-red-500/10 text-red-500 text-[10px] h-5 gap-0.5">
                          <Skull className="w-2.5 h-2.5" />
                          Chết
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col h-full min-h-[300px]">
              <div className="px-4 py-2 border-b border-white/5 bg-white/5 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider font-bold text-white/40">
                  Phòng chat: <span className="text-purple-400 font-black">{chatChannel}</span>
                </span>
                <span className="text-[10px] text-white/30 italic">
                  {chatChannel === 'wolves' && 'Bầy sói đang bàn bạc bí mật...'}
                  {chatChannel === 'ghost' && 'Linh hồn/Người xem đang chat...'}
                  {chatChannel === 'public' && 'Bàn bạc công khai ban ngày...'}
                </span>
              </div>
              <div className="flex-1 min-h-0">
                <ChatBox
                  sessionId={session.id}
                  senderId={user?.id ?? ''}
                  senderNickname={(mePlayer as any).profiles?.nickname ?? 'Spectator'}
                  channel={chatChannel}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GamePage() {
  const params = useParams()
  const { user } = useAuth()
  const roomCode = (params?.roomCode as string)?.toUpperCase()

  if (!user) return null

  return (
    <GameProvider roomCode={roomCode} userId={user.id}>
      <GameInner />
    </GameProvider>
  )
}
