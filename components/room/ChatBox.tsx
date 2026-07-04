'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { Send, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage, ChatChannel } from '@/types/database.types'

interface ChatBoxProps {
  sessionId: string
  senderId: string
  senderNickname: string
  channel: ChatChannel
  isSilenced?: boolean
}

interface MessageWithProfile extends ChatMessage {
  profiles: { nickname: string }
}

export function ChatBox({ sessionId, senderId, senderNickname, channel, isSilenced = false }: ChatBoxProps) {
  const [messages, setMessages] = useState<MessageWithProfile[]>([])
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const { register, handleSubmit, reset } = useForm<{ content: string }>()

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*, profiles(nickname)')
        .eq('session_id', sessionId)
        .eq('channel', channel)
        .order('created_at', { ascending: true })
        .limit(100)
      setMessages((data as unknown as MessageWithProfile[]) ?? [])
    }

    fetchMessages()

    const sub = supabase
      .channel(`chat:${sessionId}:${channel}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const msg = payload.new as ChatMessage
          if (msg.channel === channel) {
            // Re-fetch để có profile data
            fetchMessages()
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [sessionId, channel, supabase])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onSend = async ({ content }: { content: string }) => {
    if (!content.trim()) return
    setSending(true)
    reset()
    await (supabase.from('chat_messages') as any).insert({
      session_id: sessionId,
      channel,
      sender_id: senderId,
      content: content.trim(),
    })
    setSending(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-2 p-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-xs text-white/20 pt-4">
            Chưa có tin nhắn. Hãy nói gì đó!
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === senderId
          const nick = msg.profiles?.nickname ?? senderNickname
          return (
            <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              <Avatar className="w-6 h-6 shrink-0 mt-0.5">
                <AvatarFallback className="text-[10px] bg-zinc-800">
                  {nick[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                <span className="text-[10px] text-white/30 mb-0.5 px-1">{nick}</span>
                <div
                  className={`px-3 py-1.5 rounded-2xl text-sm ${
                    isMe
                      ? 'bg-purple-600/80 text-white rounded-tr-sm'
                      : 'bg-white/8 text-white/80 rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isSilenced && channel === 'public' ? (
        <div className="flex items-center gap-2 px-3 py-3 border-t border-white/5 bg-red-950/20">
          <span className="text-xs text-red-400/80 text-center w-full">🔇 Bạn đang bị câm lặng — không thể chat ban ngày hôm nay</span>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit(onSend)}
          className="flex gap-2 p-3 border-t border-white/5"
        >
          <Input
            placeholder="Nhắn tin..."
            maxLength={500}
            className="bg-white/5 border-white/10 text-white placeholder:text-white/20 flex-1"
            {...register('content', { required: true })}
            autoComplete="off"
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending}
            className="bg-purple-600 hover:bg-purple-500 h-10 w-10 shrink-0"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      )}
    </div>
  )
}
