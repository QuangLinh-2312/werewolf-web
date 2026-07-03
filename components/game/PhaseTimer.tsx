'use client'

import { useEffect, useState } from 'react'
import { Hourglass } from 'lucide-react'
import { useGame } from '@/contexts/GameContext'

export function PhaseTimer() {
  const { session, advancePhase } = useGame()
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!session?.phase_ends_at || session.phase === 'paused') {
      setTimeLeft(null)
      return
    }

    const calculateTimeLeft = () => {
      const difference = +new Date(session.phase_ends_at!) - +new Date()
      if (difference <= 0) {
        setTimeLeft(0)
        return 0
      }
      const seconds = Math.floor(difference / 1000)
      setTimeLeft(seconds)
      return seconds
    }

    // Tính phát đầu tiên
    const firstVal = calculateTimeLeft()

    // Nếu hết giờ ngay từ đầu
    if (firstVal === 0) {
      advancePhase()
      return
    }

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft()
      if (remaining <= 0) {
        clearInterval(timer)
        advancePhase() // Hết giờ thì tự động đổi pha ở DB
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [session?.phase_ends_at, session?.phase, advancePhase])

  if (timeLeft === null) return null

  // Format mm:ss
  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

  const isLowTime = timeLeft <= 10

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-sm font-semibold transition-colors duration-300 ${
        isLowTime
          ? 'bg-red-500/20 text-red-400 border border-red-500/30 glow-red'
          : 'bg-white/5 border border-white/10 text-white/80'
      }`}
    >
      <Hourglass className={`w-3.5 h-3.5 ${isLowTime ? 'animate-spin' : ''}`} style={{ animationDuration: '2s' }} />
      <span>{formatted}</span>
    </div>
  )
}
