'use client'

import { useEffect, useRef, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

interface AnimatedPhaseProps {
  phase: string
}

const NIGHT_PHASES = ['night_intro', 'night_actions', 'night_resolve']

export function AnimatedPhase({ phase }: AnimatedPhaseProps) {
  const [currentOverlay, setCurrentOverlay] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const prevPhaseRef = useRef<string | null>(null)

  useEffect(() => {
    if (!phase || phase === prevPhaseRef.current) return

    const prev = prevPhaseRef.current
    prevPhaseRef.current = phase

    // Chỉ animate khi thực sự chuyển pha lớn (đêm ↔ ngày)
    const comingFromNight = prev && NIGHT_PHASES.includes(prev)
    const comingFromDay = prev && !NIGHT_PHASES.includes(prev)
    const goingToNight = NIGHT_PHASES.includes(phase)
    const goingToDay = !NIGHT_PHASES.includes(phase)

    const shouldAnimate =
      (comingFromDay && goingToNight) ||
      (comingFromNight && goingToDay) ||
      phase === 'day_result' ||
      phase === 'game_over'

    if (!shouldAnimate || !prev) return

    setCurrentOverlay(phase)
    setVisible(true)

    const hideTimer = setTimeout(() => {
      setVisible(false)
    }, 2500)

    return () => clearTimeout(hideTimer)
  }, [phase])

  if (!currentOverlay) return null

  const isNight = NIGHT_PHASES.includes(currentOverlay)
  const isGameOver = currentOverlay === 'game_over'

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center pointer-events-none transition-opacity duration-700 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div className={`absolute inset-0 ${
        isGameOver
          ? 'bg-gradient-to-b from-amber-950/90 to-zinc-950/95'
          : isNight
          ? 'bg-gradient-to-b from-blue-950/90 to-zinc-950/95'
          : 'bg-gradient-to-b from-amber-950/80 to-zinc-950/90'
      } backdrop-blur-sm`} />

      {/* Content */}
      <div className={`relative z-10 flex flex-col items-center gap-4 transition-transform duration-700 ${
        visible ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'
      }`}>
        {isGameOver ? (
          <>
            <span className="text-7xl animate-bounce">🎉</span>
            <h2 className="text-3xl font-black text-white tracking-wide">Kết Thúc</h2>
          </>
        ) : isNight ? (
          <>
            <Moon className="w-20 h-20 text-blue-300 drop-shadow-[0_0_30px_rgba(147,197,253,0.5)]" />
            <h2 className="text-3xl font-black text-blue-200 tracking-wide">Đêm Buông Xuống</h2>
            <p className="text-sm text-blue-300/60">Tất cả hãy nhắm mắt lại...</p>
          </>
        ) : (
          <>
            <Sun className="w-20 h-20 text-amber-300 drop-shadow-[0_0_30px_rgba(253,224,71,0.5)]" />
            <h2 className="text-3xl font-black text-amber-200 tracking-wide">Bình Minh Lên</h2>
            <p className="text-sm text-amber-300/60">Hãy kiểm tra ai còn sống...</p>
          </>
        )}

        {/* Dot loader */}
        <div className="flex gap-1.5 mt-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${isNight ? 'bg-blue-400' : 'bg-amber-400'} animate-pulse ${
                i === 0 ? '' : i === 1 ? '[animation-delay:200ms]' : '[animation-delay:400ms]'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
