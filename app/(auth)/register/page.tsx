'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Mail, Lock, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { registerSchema, type RegisterInput } from '@/lib/validators/auth'

export default function RegisterPage() {
  const router = useRouter()
  const { signUpWithEmail } = useAuth()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })

  const onSubmit = async (data: RegisterInput) => {
    const { error } = await signUpWithEmail(data.email, data.password, data.nickname)
    if (error) {
      toast.error('Đăng ký thất bại', { description: error })
    } else {
      toast.success('Đăng ký thành công! Hãy đăng nhập để tiếp tục.')
      router.push('/login')
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Tạo tài khoản</h1>
      <p className="text-sm text-white/50 mb-6">
        Đã có tài khoản?{' '}
        <Link href="/login" className="text-purple-400 hover:text-purple-300 transition-colors">
          Đăng nhập
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="nickname" className="text-white/70">Nickname</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              id="nickname"
              placeholder="Tên hiển thị trong game"
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-purple-500"
              {...register('nickname')}
            />
          </div>
          {errors.nickname && <p className="text-xs text-red-400">{errors.nickname.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-white/70">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              id="email"
              type="email"
              placeholder="werewolf@example.com"
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-purple-500"
              {...register('email')}
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
              placeholder="Tối thiểu 6 ký tự"
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-purple-500"
              {...register('password')}
            />
          </div>
          {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-white/70">Xác nhận mật khẩu</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Nhập lại mật khẩu"
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-purple-500"
              {...register('confirmPassword')}
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold h-11 mt-2"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Tạo tài khoản'
          )}
        </Button>
      </form>

      <p className="text-xs text-white/30 text-center mt-4">
        Bằng cách đăng ký, bạn đồng ý chơi fair play 🐺
      </p>
    </div>
  )
}
