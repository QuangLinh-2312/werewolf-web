import { z } from 'zod'

export const joinRoomSchema = z.object({
  code: z
    .string()
    .min(6, 'Mã phòng phải đúng 6 ký tự')
    .max(6, 'Mã phòng phải đúng 6 ký tự')
    .regex(/^[A-Z2-9]+$/, 'Mã phòng không hợp lệ')
    .transform((v) => v.toUpperCase()),
})

export const guestNicknameSchema = z.object({
  nickname: z
    .string()
    .min(2, 'Nickname phải ít nhất 2 ký tự')
    .max(20, 'Nickname tối đa 20 ký tự')
    .regex(/^[a-zA-ZÀ-ỹ0-9 _-]+$/, 'Nickname chỉ được chứa chữ, số, dấu cách, _ và -')
    .transform((v) => v.trim()),
})

export const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu phải ít nhất 6 ký tự'),
})

export const registerSchema = z.object({
  nickname: z
    .string()
    .min(2, 'Nickname phải ít nhất 2 ký tự')
    .max(20, 'Nickname tối đa 20 ký tự')
    .transform((v) => v.trim()),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu phải ít nhất 6 ký tự'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirmPassword'],
})

export type JoinRoomInput = z.infer<typeof joinRoomSchema>
export type GuestNicknameInput = z.infer<typeof guestNicknameSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
