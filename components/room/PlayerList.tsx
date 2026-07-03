'use client'

import { Crown, Wifi, WifiOff, Check } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import type { RoomPlayerWithProfile } from '@/types/database.types'

const ROLE_EMOJIS: Record<string, string> = {
  wolf: '🐺',
  seer: '🔮',
  guard: '🛡️',
  witch: '🧪',
  hunter: '🏹',
  cupid: '💘',
  villager: '👤',
}

interface PlayerListProps {
  players: RoomPlayerWithProfile[]
  hostId: string
  currentUserId: string
}

export function PlayerList({ players, hostId, currentUserId }: PlayerListProps) {
  return (
    <div className="space-y-2">
      {players.map((p) => {
        const isHost = p.profile_id === hostId
        const isMe = p.profile_id === currentUserId
        const nickname = p.profiles?.nickname ?? 'Player'

        return (
          <div
            key={p.id}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              isMe
                ? 'bg-purple-600/10 border border-purple-500/20'
                : 'glass border border-white/0 hover:border-white/10'
            }`}
          >
            {/* Avatar */}
            <Avatar className="w-9 h-9 border border-white/10 shrink-0">
              <AvatarFallback
                className={`text-sm font-semibold ${
                  isHost ? 'bg-amber-700 text-amber-100' : 'bg-zinc-800 text-white'
                }`}
              >
                {nickname[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>

            {/* Name + badges */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-white truncate">{nickname}</span>
                {isMe && (
                  <span className="text-[10px] text-purple-400 font-medium">(bạn)</span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {isHost && (
                  <Badge className="h-4 text-[10px] bg-amber-600/30 text-amber-300 border-amber-500/30 gap-0.5">
                    <Crown className="w-2.5 h-2.5" />
                    Host
                  </Badge>
                )}
                {p.profiles?.is_guest && (
                  <Badge variant="outline" className="h-4 text-[10px] border-white/10 text-white/40">
                    Khách
                  </Badge>
                )}
              </div>
            </div>

            {/* Status icons */}
            <div className="flex items-center gap-2 shrink-0">
              {p.is_connected ? (
                <Wifi className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-white/20" />
              )}
              {p.is_ready ? (
                <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-green-400" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10" />
              )}
            </div>
          </div>
        )
      })}

      {/* Empty slots */}
      {players.length < 2 && (
        <div className="text-center text-xs text-white/20 pt-2">
          Cần tối thiểu 2 người chơi · Đang có {players.length}
        </div>
      )}
    </div>
  )
}
