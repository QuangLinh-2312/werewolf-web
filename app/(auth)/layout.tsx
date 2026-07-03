import type { ReactNode } from 'react'
import Link from 'next/link'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 -left-48 w-96 h-96 rounded-full bg-purple-600/10 blur-3xl" />
        <div className="absolute -bottom-48 -right-48 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-800/5 blur-3xl" />
      </div>

      {/* Logo */}
      <Link href="/" className="mb-8 flex flex-col items-center gap-2 group">
        <span className="text-5xl">🐺</span>
        <span className="text-xl font-bold tracking-wide text-white/80 group-hover:text-white transition-colors">
          Ma Sói Online
        </span>
      </Link>

      {/* Card */}
      <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl">
        {children}
      </div>

      <p className="mt-6 text-xs text-white/30">
        Miễn phí · Realtime · Không cần cài app
      </p>
    </div>
  )
}
