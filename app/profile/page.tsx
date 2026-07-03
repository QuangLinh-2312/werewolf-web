'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Trophy, Swords, Skull, Shield, ArrowLeft, User, Edit3,
  Check, X, Loader2, CalendarDays
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

const ROLE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  wolf:     { label: 'Ma Sói',    emoji: '🐺', color: 'text-red-400' },
  villager: { label: 'Dân Làng',  emoji: '👤', color: 'text-zinc-400' },
  seer:     { label: 'Tiên Tri',  emoji: '🔮', color: 'text-purple-400' },
  guard:    { label: 'Bảo Vệ',   emoji: '🛡️', color: 'text-blue-400' },
  witch:    { label: 'Phù Thủy', emoji: '🧪', color: 'text-emerald-400' },
  hunter:   { label: 'Thợ Săn',  emoji: '🏹', color: 'text-amber-400' },
  cupid:    { label: 'Cupid',     emoji: '💘', color: 'text-pink-400' },
}

interface GameHistoryEntry {
  game_player_id: string
  role: string
  is_alive: boolean
  died_at_phase: string | null
  died_at_day: number | null
  session_id: string
  started_at: string
  ended_at: string | null
  winner: 'wolves' | 'villagers' | null
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [history, setHistory] = useState<GameHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [editingNick, setEditingNick] = useState(false)
  const [newNickname, setNewNickname] = useState('')
  const [savingNick, setSavingNick] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return

    const loadHistory = async () => {
      setLoadingHistory(true)
      try {
        const { data, error } = await (supabase as any)
          .from('game_players')
          .select(`
            id,
            role,
            is_alive,
            died_at_phase,
            died_at_day,
            session_id,
            game_sessions!inner(
              started_at,
              ended_at,
              winner
            )
          `)
          .eq('profile_id', user.id)
          .order('game_sessions(started_at)', { ascending: false })
          .limit(20)

        if (error) throw error

        const mapped: GameHistoryEntry[] = (data ?? []).map((row: any) => ({
          game_player_id: row.id,
          role: row.role,
          is_alive: row.is_alive,
          died_at_phase: row.died_at_phase,
          died_at_day: row.died_at_day,
          session_id: row.session_id,
          started_at: row.game_sessions?.started_at,
          ended_at: row.game_sessions?.ended_at,
          winner: row.game_sessions?.winner,
        }))
        setHistory(mapped)
      } catch (e) {
        console.error('Lỗi tải lịch sử:', e)
      } finally {
        setLoadingHistory(false)
      }
    }

    loadHistory()
  }, [user, supabase])

  const handleSaveNickname = async () => {
    if (!newNickname.trim() || newNickname.trim().length < 2) {
      toast.error('Tên cần ít nhất 2 ký tự')
      return
    }
    setSavingNick(true)
    try {
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ nickname: newNickname.trim() })
        .eq('id', user!.id)
      if (error) throw error
      toast.success('Đã cập nhật tên hiển thị!')
      setEditingNick(false)
      // Reload page để refresh AuthContext
      window.location.reload()
    } catch (e: any) {
      toast.error(e.message || 'Không thể cập nhật tên')
    } finally {
      setSavingNick(false)
    }
  }

  const getResultLabel = (entry: GameHistoryEntry) => {
    if (!entry.winner) return { text: 'Đang chơi', color: 'text-white/40', bg: 'bg-white/5 border-white/10' }
    const isWolf = entry.role === 'wolf'
    const won = (isWolf && entry.winner === 'wolves') || (!isWolf && entry.winner === 'villagers')
    return won
      ? { text: 'Thắng', color: 'text-green-400', bg: 'bg-green-950/20 border-green-500/20' }
      : { text: 'Thua', color: 'text-red-400', bg: 'bg-red-950/20 border-red-500/20' }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (authLoading || !user || !profile) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    )
  }

  const winRate = (profile.wins + profile.losses) > 0
    ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100)
    : 0

  return (
    <div className="min-h-dvh flex flex-col max-w-2xl mx-auto px-4 py-6 gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => router.push('/')}
          className="w-8 h-8 text-white/50 hover:text-white shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-xl font-bold text-white">Hồ sơ cá nhân</h1>
      </div>

      {/* Profile Card */}
      <div className="glass rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-5">
        {/* Avatar */}
        <Avatar className="w-20 h-20 border-2 border-purple-500/30 shrink-0">
          <AvatarFallback className="bg-purple-950 text-purple-300 text-3xl font-bold">
            {profile.nickname[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Info */}
        <div className="flex-1 min-w-0 text-center sm:text-left">
          {editingNick ? (
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <Input
                defaultValue={profile.nickname}
                onChange={(e) => setNewNickname(e.target.value)}
                className="h-9 bg-white/5 border-white/20 text-white text-base font-bold max-w-[180px]"
                autoFocus
                maxLength={20}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveNickname()
                  if (e.key === 'Escape') setEditingNick(false)
                }}
              />
              <Button
                size="icon"
                onClick={handleSaveNickname}
                disabled={savingNick}
                className="w-8 h-8 bg-green-600 hover:bg-green-500"
              >
                {savingNick ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditingNick(false)}
                className="w-8 h-8 text-white/40 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <h2 className="text-xl font-extrabold text-white truncate">{profile.nickname}</h2>
              {!profile.is_guest && (
                <button
                  onClick={() => { setNewNickname(profile.nickname); setEditingNick(true) }}
                  className="text-white/30 hover:text-white/60 transition-colors"
                  aria-label="Đổi tên hiển thị"
                  title="Đổi tên hiển thị"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {profile.is_guest && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs mt-1">
              Tài khoản Khách
            </Badge>
          )}
          {!profile.is_guest && (
            <p className="text-xs text-white/40 mt-1">{user.email}</p>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-4 shrink-0">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-green-950/30 border border-green-500/20 flex flex-col items-center justify-center">
              <Trophy className="w-4 h-4 text-green-400 mb-0.5" />
              <span className="text-sm font-bold text-green-400">{profile.wins}</span>
            </div>
            <div className="text-[10px] text-white/40 mt-1">Thắng</div>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-red-950/30 border border-red-500/20 flex flex-col items-center justify-center">
              <Swords className="w-4 h-4 text-red-400 mb-0.5" />
              <span className="text-sm font-bold text-red-400">{profile.losses}</span>
            </div>
            <div className="text-[10px] text-white/40 mt-1">Thua</div>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-purple-950/30 border border-purple-500/20 flex flex-col items-center justify-center">
              <Shield className="w-4 h-4 text-purple-400 mb-0.5" />
              <span className="text-sm font-bold text-purple-400">{winRate}%</span>
            </div>
            <div className="text-[10px] text-white/40 mt-1">Tỉ lệ</div>
          </div>
        </div>
      </div>

      {/* Game History */}
      <div>
        <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          Lịch sử ván đấu gần đây
        </h2>

        {loadingHistory ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          </div>
        ) : history.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center">
            <User className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/40">Bạn chưa tham gia ván đấu nào.</p>
            <Button
              onClick={() => router.push('/')}
              className="mt-4 bg-purple-600 hover:bg-purple-500 text-sm"
            >
              Chơi ngay
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => {
              const roleInfo = ROLE_LABELS[entry.role] ?? { label: entry.role, emoji: '❓', color: 'text-white/60' }
              const result = getResultLabel(entry)
              return (
                <Card key={entry.game_player_id}
                  className={`flex items-center gap-4 p-4 border rounded-2xl transition-all ${result.bg}`}
                >
                  {/* Role */}
                  <div className="text-2xl shrink-0">{roleInfo.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${roleInfo.color}`}>{roleInfo.label}</span>
                      <Badge variant="outline"
                        className={`text-[10px] h-4 ${entry.is_alive ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}
                      >
                        {entry.is_alive ? 'Sống sót' : (
                          entry.died_at_phase === 'night' ? `Chết ban đêm (Ngày ${entry.died_at_day})` :
                          entry.died_at_phase === 'day_vote' ? `Bị treo cổ (Ngày ${entry.died_at_day})` :
                          `Đã chết`
                        )}
                      </Badge>
                    </div>
                    <p className="text-xs text-white/30 mt-0.5">{formatDate(entry.started_at)}</p>
                  </div>
                  {/* Result */}
                  <div className={`text-xs font-extrabold uppercase tracking-wider shrink-0 ${result.color}`}>
                    {result.text}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
