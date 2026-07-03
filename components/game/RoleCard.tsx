'use client'

import { useState } from 'react'
import { Eye, EyeOff, Moon, Sun, Target, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getRoleDefinition } from '@/lib/game/roles'
import type { RoleKey } from '@/types/database.types'

interface RoleCardProps {
  roleKey: string
  defaultRevealed?: boolean
}

export function RoleCard({ roleKey, defaultRevealed = false }: RoleCardProps) {
  const [revealed, setRevealed] = useState(defaultRevealed)
  const info = getRoleDefinition(roleKey)

  return (
    <div className="w-full max-w-md mx-auto">
      <Card
        className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
          revealed
            ? `bg-gradient-to-br ${info.cardBg} border-white/15 shadow-lg`
            : 'bg-zinc-900/90 border-white/10'
        }`}
      >
        {!revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="w-full flex flex-col items-center justify-center p-8 text-center min-h-[220px] hover:bg-white/5 transition-colors"
          >
            <div className="w-16 h-16 rounded-full bg-purple-600/15 border border-purple-500/30 flex items-center justify-center mb-4">
              <span className="text-3xl">🃏</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Thẻ Vai Trò</h3>
            <p className="text-xs text-white/45 mb-4 max-w-[240px]">
              Bấm để lật thẻ và xem đầy đủ thông tin vai trò của bạn
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs text-purple-300 font-semibold bg-purple-500/10 px-3 py-1.5 rounded-full border border-purple-500/25">
              <Eye className="w-3.5 h-3.5" />
              Lật thẻ bài
            </span>
          </button>
        ) : (
          <div className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-5xl leading-none">{info.emoji}</span>
                <div>
                  <h4 className="text-xl font-extrabold text-white">{info.name}</h4>
                  <p className="text-xs text-white/50 italic mt-0.5">{info.tagline}</p>
                  <Badge className={`mt-2 text-[10px] uppercase tracking-wider ${info.color}`}>
                    {info.alliance}
                  </Badge>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRevealed(false)}
                className="text-white/30 hover:text-white/70 p-1"
                aria-label="Úp thẻ"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            </div>

            {/* Mô tả chính */}
            <p className="text-sm text-white/75 leading-relaxed bg-black/25 rounded-xl p-3 border border-white/5">
              {info.description}
            </p>

            {/* Khả năng */}
            <div className="grid gap-2">
              {info.nightAbility && (
                <div className="flex gap-2.5 p-3 rounded-xl bg-blue-950/25 border border-blue-800/20">
                  <Moon className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-blue-300/70 font-bold block mb-0.5">
                      Ban đêm
                    </span>
                    <p className="text-xs text-white/70 leading-relaxed">{info.nightAbility}</p>
                  </div>
                </div>
              )}
              <div className="flex gap-2.5 p-3 rounded-xl bg-amber-950/20 border border-amber-800/20">
                <Sun className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-amber-300/70 font-bold block mb-0.5">
                    Ban ngày
                  </span>
                  <p className="text-xs text-white/70 leading-relaxed">{info.dayAbility}</p>
                </div>
              </div>
              <div className="flex gap-2.5 p-3 rounded-xl bg-purple-950/20 border border-purple-800/20">
                <Trophy className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-purple-300/70 font-bold block mb-0.5">
                    Điều kiện thắng
                  </span>
                  <p className="text-xs text-white/70 leading-relaxed">{info.winCondition}</p>
                </div>
              </div>
            </div>

            {/* Mẹo chơi */}
            <div className="rounded-xl border border-white/5 bg-white/5 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="w-3.5 h-3.5 text-white/40" />
                <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                  Mẹo chơi
                </span>
              </div>
              <ul className="space-y-1.5">
                {info.tips.map((tip) => (
                  <li key={tip} className="text-xs text-white/60 leading-relaxed flex gap-2">
                    <span className="text-purple-400 shrink-0">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

export function RoleCardCompact({ roleKey }: { roleKey: string }) {
  const info = getRoleDefinition(roleKey)
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${info.color}`}>
      <span>{info.emoji}</span>
      <span className="text-sm font-semibold">{info.name}</span>
    </div>
  )
}
