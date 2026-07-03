'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useGame } from '@/contexts/GameContext'

export function VotePanel() {
  const { session, me, players, votes, submitVote } = useGame()
  const [submitting, setSubmitting] = useState(false)

  if (!session || !me || !me.is_alive) return null

  // Tìm vote của me hiện tại
  const myVote = votes.find((v) => v.voter_id === me.id)
  // undefined = chưa vote; null = bỏ phiếu trắng; string = vote người chơi
  const votedTargetId = myVote ? myVote.target_id : undefined
  const hasVoted = myVote !== undefined

  // Debug: log ra để kiểm tra
  // console.log('[VotePanel] me.id:', me.id, 'me.profile_id:', me.profile_id)
  // console.log('[VotePanel] players:', players.map(p => ({ id: p.id, profile_id: p.profile_id, is_alive: p.is_alive, nick: p.profiles?.nickname })))

  // Lọc những người chơi còn sống, trừ bản thân (dùng row id để chắc chắn)
  const alivePlayers = players.filter((p) => p.is_alive && p.id !== me.id)

  const handleVote = async (targetPlayerId: string | null) => {
    setSubmitting(true)
    try {
      await submitVote(targetPlayerId)
      toast.success(targetPlayerId ? 'Đã bỏ phiếu' : 'Đã bỏ phiếu trắng')
    } catch {
      toast.error('Bỏ phiếu thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  const getVoteCountFor = (playerId: string) =>
    votes.filter((v) => v.target_id === playerId).length

  const whiteVotesCount = votes.filter((v) => v.target_id === null).length
  const isWhiteSelected = hasVoted && votedTargetId === null

  return (
    <div className="glass rounded-2xl p-6 border border-amber-500/20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg bg-amber-500/20 text-amber-400">
          ⚖️
        </div>
        <div>
          <h3 className="font-bold text-white">Phiếu Bầu Treo Cổ</h3>
          <p className="text-xs text-white/40">
            {hasVoted
              ? isWhiteSelected
                ? 'Bạn đã bỏ phiếu trắng — có thể đổi ý'
                : 'Bạn đã vote — có thể đổi ý'
              : 'Hãy bình chọn người bạn tình nghi nhất là Ma Sói'}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {/* Danh sách người chơi còn sống */}
        {alivePlayers.length === 0 ? (
          <div className="text-center py-4 text-white/40 text-sm">
            Không có người chơi nào khác còn sống để bỏ phiếu.
          </div>
        ) : (
          alivePlayers.map((p) => {
            const nick = p.profiles?.nickname ?? 'Player'
            const totalVotes = getVoteCountFor(p.id)
            const isSelected = hasVoted && votedTargetId === p.id

            return (
              <div
                key={p.id}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500/40 scale-[1.01]'
                    : 'border-white/5 bg-white/5 hover:border-white/15'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 border border-white/10">
                    <AvatarFallback className="bg-zinc-800 text-white text-xs">
                      {nick[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-white">{nick}</span>
                </div>

                <div className="flex items-center gap-3">
                  {totalVotes > 0 && (
                    <span className="text-xs text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      {totalVotes} vote
                    </span>
                  )}
                  <Button
                    size="sm"
                    disabled={submitting}
                    onClick={() => handleVote(p.id)}
                    className={`h-8 min-w-[72px] font-semibold transition-all ${
                      isSelected
                        ? 'bg-amber-500 hover:bg-amber-400 text-zinc-900 border border-amber-400'
                        : 'bg-white/10 border border-white/20 text-white hover:bg-amber-500/20 hover:border-amber-500/40 hover:text-amber-200'
                    }`}
                  >
                    {isSelected ? (
                      <span className="flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        Đã vote
                      </span>
                    ) : (
                      'Bỏ phiếu'
                    )}
                  </Button>
                </div>
              </div>
            )
          })
        )}

        {/* Divider */}
        <div className="border-t border-white/5 pt-1" />

        {/* Vote trắng */}
        <div
          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
            isWhiteSelected
              ? 'bg-zinc-700/30 border-white/20'
              : 'border-white/5 bg-white/5 hover:border-white/15'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-white/40 text-xs">
              ⚪
            </div>
            <div>
              <span className="text-sm font-medium text-white/70">Bỏ phiếu trắng</span>
              <p className="text-[10px] text-white/30">Không treo cổ ai cả</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {whiteVotesCount > 0 && (
              <span className="text-xs text-white/40 font-bold bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                {whiteVotesCount} vote
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => handleVote(null)}
              className={`h-8 min-w-[72px] font-semibold transition-all ${
                isWhiteSelected
                  ? 'border-white/30 text-white/70 bg-white/10'
                  : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
              }`}
            >
              {isWhiteSelected ? (
                <span className="flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Đã chọn
                </span>
              ) : (
                'Trắng'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
