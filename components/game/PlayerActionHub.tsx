'use client'

import { MessageSquare, Moon, Sun, Vote, Pause } from 'lucide-react'
import { useGame } from '@/contexts/GameContext'
import { getRoleDefinition } from '@/lib/game/roles'
import { NightActionPanel } from '@/components/game/NightActionPanel'
import { VotePanel } from '@/components/game/VotePanel'
import type { GamePhase } from '@/types/database.types'

function PhaseBanner({
  icon,
  title,
  description,
  accent,
}: {
  icon: React.ReactNode
  title: string
  description: string
  accent: string
}) {
  return (
    <div className={`rounded-xl border p-4 mb-4 ${accent}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div>
          <h3 className="font-bold text-white text-sm mb-1">{title}</h3>
          <p className="text-xs text-white/55 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}

export function PlayerActionHub() {
  const { session, me, players } = useGame()

  if (!session || !me) return null

  const roleDef = getRoleDefinition(me.role)
  const phase = session.phase as GamePhase
  const isAlive = me.is_alive

  // Khi đang tạm dừng — không cho hành động
  if (phase === 'paused') {
    return (
      <PhaseBanner
        icon={<Pause className="w-5 h-5 text-yellow-400" />}
        title="Ván đấu đang tạm dừng"
        description="Chờ người chơi hoặc chủ phòng tiếp tục ván."
        accent="bg-yellow-950/20 border-yellow-800/25"
      />
    )
  }

  // Ban đêm — intro
  if (phase === 'night_intro') {
    return (
      <PhaseBanner
        icon={<Moon className="w-5 h-5 text-blue-400" />}
        title="Đêm đang buông xuống..."
        description="Cả làng nhắm mắt. Vai trò đặc biệt sẽ được mời hành động trong giây lát. Hãy sẵn sàng!"
        accent="bg-blue-950/20 border-blue-800/25"
      />
    )
  }

  // Ban đêm — hành động
  if (phase === 'night_actions') {
    if (!isAlive) {
      return (
        <PhaseBanner
          icon={<Moon className="w-5 h-5 text-white/30" />}
          title="Bạn đã chết"
          description="Không thể hành động ban đêm. Dùng tab Chat → kênh Linh Hồn để trò chuyện."
          accent="bg-zinc-900/50 border-white/5"
        />
      )
    }

    if (roleDef.canActAtNight) {
      if (me.role === 'cupid' && session.day_number !== 1) {
        return (
          <PhaseBanner
            icon={<Moon className="w-5 h-5 text-pink-400" />}
            title="Cupid đã ghép đôi xong"
            description="Cupid chỉ hành động đêm 1. Hãy chờ bình minh."
            accent="bg-pink-950/15 border-pink-800/20"
          />
        )
      }
      if (me.role === 'doppelganger' && session.day_number !== 1) {
        return (
          <PhaseBanner
            icon={<Moon className="w-5 h-5 text-fuchsia-400" />}
            title="Kẻ Nhân Bản đã đánh dấu xong"
            description="Bạn đã đánh dấu mục tiêu ở Đêm 1. Chờ người đó chết để nhận vai của họ."
            accent="bg-fuchsia-950/15 border-fuchsia-800/20"
          />
        )
      }
      return <NightActionPanel />
    }

    return (
      <PhaseBanner
        icon={<Moon className="w-5 h-5 text-blue-300/50" />}
        title="Bạn đang ngủ yên"
        description={`Vai ${roleDef.name} không có hành động ban đêm. Chờ các vai đặc biệt hoàn thành.`}
        accent="bg-blue-950/10 border-blue-900/15"
      />
    )
  }

  // Bình minh — kết quả đêm
  if (phase === 'day_result') {
    const deadTonight = players.filter(
      (p) => !p.is_alive && p.died_at_day === session.day_number &&
        (p.died_at_phase === 'night' || p.died_at_phase === 'night_lover')
    )
    return (
      <PhaseBanner
        icon={<Sun className="w-5 h-5 text-amber-400" />}
        title={deadTonight.length === 0 ? 'Đêm yên bình!' : `${deadTonight.length} người chết đêm qua`}
        description={
          deadTonight.length === 0
            ? 'Không ai bị sát hại. Sắp chuyển sang thảo luận ban ngày.'
            : `Nạn nhân: ${deadTonight.map((p) => p.profiles?.nickname).join(', ')}. Chuẩn bị thảo luận.`
        }
        accent="bg-amber-950/20 border-amber-800/25"
      />
    )
  }

  // Thảo luận ban ngày
  if (phase === 'day_discussion') {
    if (!isAlive) {
      return (
        <PhaseBanner
          icon={<MessageSquare className="w-5 h-5 text-purple-400/50" />}
          title="Thảo luận ban ngày"
          description="Bạn đã chết — quan sát và chat kênh Linh Hồn."
          accent="bg-zinc-900/40 border-white/5"
        />
      )
    }
    return (
      <>
        <PhaseBanner
          icon={<MessageSquare className="w-5 h-5 text-amber-400" />}
          title="Thảo luận ban ngày — HÀNH ĐỘNG CỦA BẠN"
          description="Mở tab Chat → kênh Công khai để tranh luận ai là Ma Sói. Quan sát hành vi, đối chất, rồi chuẩn bị bỏ phiếu."
          accent="bg-amber-950/25 border-amber-600/30"
        />
        <div className="glass rounded-xl p-4 border border-white/5">
          <p className="text-xs text-white/40 mb-2 font-semibold uppercase tracking-wider">
            Người còn sống ({players.filter((p) => p.is_alive).length})
          </p>
          <div className="flex flex-wrap gap-2">
            {players
              .filter((p) => p.is_alive)
              .map((p) => (
                <span
                  key={p.id}
                  className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70"
                >
                  {p.profiles?.nickname}
                </span>
              ))}
          </div>
        </div>
      </>
    )
  }

  // Bỏ phiếu
  if (phase === 'day_vote') {
    if (!isAlive) {
      return (
        <PhaseBanner
          icon={<Vote className="w-5 h-5 text-white/30" />}
          title="Đang bỏ phiếu treo cổ"
          description="Bạn đã chết — không thể vote. Chờ kết quả."
          accent="bg-zinc-900/40 border-white/5"
        />
      )
    }
    return <VotePanel />
  }

  // Kết quả vote
  if (phase === 'day_vote_result') {
    const hanged = players.filter(
      (p) => !p.is_alive && p.died_at_day === session.day_number &&
        (p.died_at_phase === 'day_vote' || p.died_at_phase === 'day_vote_lover' || p.died_at_phase === 'avenger_drag')
    )
    const avengerDrag = hanged.find((p) => p.died_at_phase === 'avenger_drag')
    const mainHanged = hanged.find((p) => p.died_at_phase === 'day_vote')
    const descriptionExtra = avengerDrag ? ` Sói Phục Hận kéo theo ${avengerDrag.profiles?.nickname}!` : ''
    return (
      <PhaseBanner
        icon={<Vote className="w-5 h-5 text-amber-500" />}
        title={!mainHanged ? 'Không ai bị treo cổ' : `${mainHanged.profiles?.nickname} bị treo cổ`}
        description={
          !mainHanged
            ? 'Hòa phiếu hoặc đa số bỏ phiếu trắng. Chuẩn bị cho đêm mới.'
            : `Người bị treo cổ đã rời ván.${descriptionExtra} Thợ Săn (nếu có) có thể nổ súng phục hận.`
        }
        accent="bg-amber-950/15 border-amber-700/20"
      />
    )
  }

  return null
}
