'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Mail, Lock, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema, type LoginInput } from '@/lib/validators/auth'
import { guestNicknameSchema, type GuestNicknameInput } from '@/lib/validators/auth'

export default function LoginPage() {
  const router = useRouter()
  const { signInWithEmail, signInAsGuest } = useAuth()
  const [guestMode, setGuestMode] = useState(false)

  const {
    register: reg,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  const {
    register: guestReg,
    handleSubmit: guestSubmit,
    formState: { errors: guestErrors, isSubmitting: guestSubmitting },
  } = useForm<GuestNicknameInput>({ resolver: zodResolver(guestNicknameSchema) })

  const onLogin = async (data: LoginInput) => {
    const { error } = await signInWithEmail(data.email, data.password)
    if (error) {
      toast.error('Đăng nhập thất bại', { description: error })
    } else {
      toast.success('Chào mừng trở lại!')
      router.push('/')
    }
  }

  const onGuest = async (data: GuestNicknameInput) => {
    const { error } = await signInAsGuest(data.nickname)
    if (error) {
      toast.error('Không thể tạo tài khoản khách', { description: error })
    } else {
      toast.success(`Xin chào, ${data.nickname}!`)
      router.push('/')
    }
  }

  return (
    <div>
      {!guestMode ? (
        <>
          <h1 className="text-2xl font-bold text-white mb-1">Đăng nhập</h1>
          <p className="text-sm text-white/50 mb-6">
            Chưa có tài khoản?{' '}
            <Link href="/register" className="text-purple-400 hover:text-purple-300 transition-colors">
              Đăng ký ngay
            </Link>
          </p>

          <form onSubmit={handleSubmit(onLogin)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white/70">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <Input
                  id="email"
                  type="email"
                  placeholder="werewolf@example.com"
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-purple-500"
                  {...reg('email')}
                />
              </div>
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-white/70">Mật khẩu</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-purple-500"
                  {...reg('password')}
                />
              </div>
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold h-11"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Đăng nhập'}
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-zinc-950/80 text-white/30">hoặc</span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setGuestMode(true)}
            className="w-full border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:border-amber-400 h-11 gap-2"
          >
            <Zap className="w-4 h-4" />
            Chơi ngay (Khách)
          </Button>
        </>
      ) : (
        <>
          <button
            onClick={() => setGuestMode(false)}
            className="text-sm text-white/40 hover:text-white/70 mb-4 flex items-center gap-1 transition-colors"
          >
            ← Quay lại
          </button>
          <h1 className="text-2xl font-bold text-white mb-1">Chơi thử ngay!</h1>
          <p className="text-sm text-white/50 mb-6">Chỉ cần nhập nickname, không cần đăng ký</p>

          <form onSubmit={guestSubmit(onGuest)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nickname" className="text-white/70">Nickname</Label>
              <Input
                id="nickname"
                placeholder="VD: SóiXám, Dânlàng..."
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-amber-500"
                {...guestReg('nickname')}
              />
              {guestErrors.nickname && (
                <p className="text-xs text-red-400">{guestErrors.nickname.message}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={guestSubmitting}
              className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold h-11 gap-2"
            >
              {guestSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Vào chơi ngay!
                </>
              )}
            </Button>
          </form>

          <p className="text-xs text-white/30 text-center mt-4">
            Tài khoản khách không lưu lịch sử ván đấu
          </p>
        </>
      )}
    </div>
  )
}
