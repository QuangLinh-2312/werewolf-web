'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, Plus, LogIn, LogOut, User, Trophy, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { joinRoomSchema, type JoinRoomInput } from '@/lib/validators/auth'

export default function HomePage() {
  const router = useRouter()
  const { user, profile, signOut, loading } = useAuth()
  const [creating, setCreating] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<JoinRoomInput>({ resolver: zodResolver(joinRoomSchema) })

  const handleCreateRoom = async () => {
    if (!user) {
      router.push('/login')
      return
    }
    setCreating(true)
    try {
      const { data, error } = await (supabase.rpc as any)('create_room')
      if (error) throw error
      const roomData = data as any
      toast.success(`Phòng ${roomData.code} đã được tạo!`)
      router.push(`/room/${roomData.code}/lobby`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Không thể tạo phòng'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  const handleJoinRoom = async (data: JoinRoomInput) => {
    if (!user) {
      router.push('/login')
      return
    }
    const { data: room, error } = await (supabase as any)
      .from('rooms')
      .select('id, code, status')
      .eq('code', data.code)
      .single()

    if (error || !room) {
      toast.error('Không tìm thấy phòng', { description: `Mã ${data.code} không tồn tại` })
      return
    }
    const rData = room as { id: string; code: string; status: string }
    if (rData.status === 'finished') {
      toast.error('Phòng đã đóng')
      return
    }
    if (rData.status === 'playing') {
      const { data: member } = await (supabase as any)
        .from('room_players')
        .select('id')
        .eq('room_id', rData.id)
        .eq('profile_id', user.id)
        .maybeSingle()

      if (member) {
        router.push(`/room/${rData.code}/game`)
        return
      }
      toast.error('Ván đang diễn ra', { description: 'Phòng này đang trong trận' })
      return
    }
    router.push(`/room/${rData.code}/lobby`)
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐺</span>
          <span className="font-bold text-white/80 hidden sm:block">Ma Sói Online</span>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="flex items-center gap-2 mr-1">
                <Avatar className="w-7 h-7 border border-white/10">
                  <AvatarFallback className="bg-purple-900 text-white text-xs">
                    {profile?.nickname?.[0]?.toUpperCase() ?? '?'}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => router.push('/profile')}
                  className="text-sm text-white/70 hidden sm:block hover:text-white transition-colors"
                >
                  {profile?.nickname}
                </button>
                {profile?.is_guest && (
                  <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400 hidden sm:block">
                    Khách
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={signOut}
                className="text-white/40 hover:text-white/70 w-8 h-8"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/login')}
              className="border-white/10 text-white/70 hover:bg-white/5"
            >
              <User className="w-4 h-4 mr-1.5" />
              Đăng nhập
            </Button>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center mb-12">
          <div className="text-7xl mb-4 [animation-duration:3s] animate-bounce">🐺</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-3 tracking-tight">
            Ma Sói{' '}
            <span className="bg-gradient-to-r from-purple-400 to-amber-400 bg-clip-text text-transparent">
              Online
            </span>
          </h1>
          <p className="text-base sm:text-lg text-white/50 max-w-md mx-auto">
            Chơi cùng bạn bè, realtime, không cần cài app.<br />
            Bot dẫn chuyện tự động — bạn chỉ cần chơi! 🌙
          </p>
        </div>

        {/* Stats nếu đã đăng nhập */}
        {user && profile && !profile.is_guest && (
          <div className="flex gap-4 mb-8">
            <div className="glass px-5 py-3 rounded-xl text-center">
              <Trophy className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <div className="text-xl font-bold text-white">{profile.wins}</div>
              <div className="text-xs text-white/40">Thắng</div>
            </div>
            <div className="glass px-5 py-3 rounded-xl text-center">
              <Swords className="w-4 h-4 text-red-400 mx-auto mb-1" />
              <div className="text-xl font-bold text-white">{profile.losses}</div>
              <div className="text-xs text-white/40">Thua</div>
            </div>
          </div>
        )}

        {/* Action cards */}
        <div className="w-full max-w-md space-y-4">
          {/* Tạo phòng */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
              <Plus className="w-5 h-5 text-purple-400" />
              Tạo phòng mới
            </h2>
            <p className="text-sm text-white/40 mb-4">
              Host phòng, cấu hình vai trò và mời bạn bè
            </p>
            <Button
              onClick={handleCreateRoom}
              disabled={creating}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold h-11 glow-purple transition-all"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Tạo phòng
                </>
              )}
            </Button>
          </div>

          {/* Join phòng */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
              <LogIn className="w-5 h-5 text-amber-400" />
              Tham gia phòng
            </h2>
            <p className="text-sm text-white/40 mb-4">Nhập mã phòng 6 ký tự từ bạn</p>
            <form onSubmit={handleSubmit(handleJoinRoom)} className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="VD: ABC123"
                  maxLength={6}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-amber-500 uppercase tracking-widest font-mono text-center text-lg h-11"
                  {...register('code')}
                  onChange={(e) => setValue('code', e.target.value.toUpperCase())}
                />
                {errors.code && (
                  <p className="text-xs text-red-400 mt-1">{errors.code.message}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-amber-500 hover:bg-amber-400 text-zinc-900 font-semibold h-11 px-5"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Vào'}
              </Button>
            </form>
          </div>

          {/* Guest prompt */}
          {!user && (
            <p className="text-center text-sm text-white/40">
              <button
                onClick={() => router.push('/login')}
                className="text-amber-400 hover:text-amber-300 transition-colors"
              >
                Chơi thử ngay (không cần đăng ký) →
              </button>
            </p>
          )}
        </div>
      </main>

      <footer className="text-center py-4 text-xs text-white/20">
        Werewolf Online · Free forever · Powered by Supabase
      </footer>
    </div>
  )
}
