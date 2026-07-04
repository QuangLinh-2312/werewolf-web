// scripts/seed-game.mjs
// Tạo ván chơi giả với bot players để test nhanh
// Chạy: node scripts/seed-game.mjs [số_người=6] [email_của_bạn]
//
// Ví dụ:
//   node scripts/seed-game.mjs
//   node scripts/seed-game.mjs 8
//   node scripts/seed-game.mjs 6 myemail@gmail.com
//
// Yêu cầu: file .env.local phải có SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Load .env.local ────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.trim().split('=').map(s => s.trim()))
)

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
const SITE_URL = env['NEXT_PUBLIC_SITE_URL'] || 'http://localhost:3000'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ── Config ─────────────────────────────────────────────────────────────────
const BOT_COUNT = parseInt(process.argv[2] ?? '5')   // số bot (không kể bạn)
const YOUR_EMAIL = process.argv[3] ?? null            // email tài khoản bạn (optional)

const BOT_NICKNAMES = [
  'SóiXám', 'TiênTri', 'PhùThủy', 'BảoVệ', 'ThợSăn',
  'Cupid', 'DânLàng', 'TrưởngLàng', 'KẻĐiên', 'SóiTiênTri',
  'PhùThủyCâm', 'ThámTử', 'SóiPhụcHận', 'KẻNhânBản'
]

// ── Helpers ────────────────────────────────────────────────────────────────
function log(msg) { console.log(`  ${msg}`) }
function ok(msg)  { console.log(`  ✅ ${msg}`) }
function info(msg){ console.log(`\n📋 ${msg}`) }

async function createBotUser(nickname) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: `bot-${Date.now()}-${Math.random().toString(36).slice(2)}@seed.local`,
    password: 'seed-password-not-real',
    email_confirm: true,
    user_metadata: { nickname },
  })
  if (error) throw new Error(`Tạo bot "${nickname}" thất bại: ${error.message}`)
  return data.user
}

async function findUserByEmail(email) {
  // Tìm user qua admin API (list và filter)
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (error) throw new Error(`Tìm user thất bại: ${error.message}`)
  const found = data.users.find(u => u.email === email)
  if (!found) throw new Error(`Không tìm thấy user với email: ${email}`)
  return found
}

async function waitForProfile(userId, retries = 10) {
  for (let i = 0; i < retries; i++) {
    const { data } = await supabase.from('profiles').select('id').eq('id', userId).single()
    if (data) return true
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`Profile không tạo được cho user ${userId}`)
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🐺 Werewolf Seed Script')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━')

  // 1. Xác định host (bạn hoặc 1 bot)
  let hostUser = null
  if (YOUR_EMAIL) {
    info(`Tìm tài khoản của bạn: ${YOUR_EMAIL}`)
    hostUser = await findUserByEmail(YOUR_EMAIL)
    ok(`Host: ${YOUR_EMAIL} (${hostUser.id.slice(0, 8)}...)`)
  }

  // 2. Tạo bots
  info(`Tạo ${BOT_COUNT} bot players...`)
  const botUsers = []
  for (let i = 0; i < BOT_COUNT; i++) {
    const nickname = BOT_NICKNAMES[i % BOT_NICKNAMES.length] + (i >= BOT_NICKNAMES.length ? `_${i}` : '')
    try {
      const user = await createBotUser(nickname)
      await waitForProfile(user.id)
      botUsers.push(user)
      log(`Bot ${i + 1}/${BOT_COUNT}: ${nickname} (${user.id.slice(0, 8)}...)`)
    } catch (e) {
      console.warn(`  ⚠️ ${e.message} — bỏ qua`)
    }
  }

  // Host là bot đầu tiên nếu không có email
  if (!hostUser) hostUser = botUsers[0]
  const allUsers = hostUser === botUsers[0]
    ? botUsers
    : [hostUser, ...botUsers]

  ok(`Tổng ${allUsers.length} người chơi (1 host + ${allUsers.length - 1} bot)`)

  // 3. Tạo phòng bằng SQL trực tiếp (qua service role)
  info('Tạo phòng...')
  const roomCode = Math.random().toString(36).slice(2, 8).toUpperCase()

  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .insert({ code: roomCode, host_id: hostUser.id, status: 'lobby' })
    .select()
    .single()
  if (roomErr) throw new Error(`Tạo phòng thất bại: ${roomErr.message}`)
  ok(`Phòng: ${roomCode} (ID: ${room.id.slice(0, 8)}...)`)

  // 4. Thêm tất cả vào room_players
  info('Thêm người chơi vào phòng...')
  const roomPlayers = allUsers.map(u => ({
    room_id: room.id,
    profile_id: u.id,
    is_ready: true,
  }))
  const { error: rpErr } = await supabase.from('room_players').insert(roomPlayers)
  if (rpErr) throw new Error(`Thêm room_players thất bại: ${rpErr.message}`)
  ok(`Đã thêm ${allUsers.length} người vào phòng`)

  // 5. Tạo game_session
  info('Bắt đầu ván chơi (gán vai)...')
  const roles = buildRoles(allUsers.length)
  const rolePool = Object.entries(roles).flatMap(([r, n]) => Array(n).fill(r))
  // Shuffle
  for (let i = rolePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rolePool[i], rolePool[j]] = [rolePool[j], rolePool[i]]
  }

  const { data: session, error: sessErr } = await supabase
    .from('game_sessions')
    .insert({ room_id: room.id, phase: 'day_discussion', day_number: 1 })
    .select()
    .single()
  if (sessErr) throw new Error(`Tạo session thất bại: ${sessErr.message}`)

  const gamePlayers = allUsers.map((u, i) => ({
    session_id: session.id,
    profile_id: u.id,
    role: rolePool[i],
    is_alive: true,
  }))
  const { error: gpErr } = await supabase.from('game_players').insert(gamePlayers)
  if (gpErr) throw new Error(`Tạo game_players thất bại: ${gpErr.message}`)

  // Cập nhật phòng sang playing
  await supabase.from('rooms').update({ status: 'playing' }).eq('id', room.id)

  // 6. Cập nhật nickname của bot để đồng bộ với vai trò (tránh gây nhầm lẫn)
  info('Đồng bộ nickname bot với vai trò...')
  const ROLE_NAMES = {
    wolf: 'Sói', villager: 'Dân', seer: 'TiênTri', guard: 'BảoVệ',
    witch: 'PhùThủy', hunter: 'ThợSăn', cupid: 'Cupid', elder: 'TrưởngLàng', jester: 'KẻĐiên'
  }
  const roleCounts = {}
  for (let i = 0; i < allUsers.length; i++) {
    const u = allUsers[i]
    if (u.email && u.email.startsWith('bot-')) {
      const r = rolePool[i]
      roleCounts[r] = (roleCounts[r] || 0) + 1
      const roleName = ROLE_NAMES[r] || r
      const newNickname = `${roleName}_${roleCounts[r]}`

      // Cập nhật auth metadata và public.profiles
      await supabase.auth.admin.updateUserById(u.id, {
        user_metadata: { nickname: newNickname }
      })
      await supabase.from('profiles').update({ nickname: newNickname }).eq('id', u.id)
      
      u.user_metadata = { ...u.user_metadata, nickname: newNickname }
    }
  }

  // 7. In kết quả
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🎉 Ván chơi đã sẵn sàng!\n')
  console.log(`🔗 Link vào game:`)
  console.log(`   ${SITE_URL}/room/${roomCode}/game`)
  console.log(`\n🃏 Phân vai:`)
  gamePlayers.forEach((gp, i) => {
    const nick = allUsers[i].user_metadata?.nickname ?? allUsers[i].email
    const isHost = allUsers[i].id === hostUser.id
    console.log(`   ${isHost ? '👑' : '🤖'} ${nick.padEnd(16)} → ${gp.role}`)
  })
  console.log('\n💡 Phase hiện tại: day_discussion (ban ngày thảo luận)')
  if (YOUR_EMAIL) {
    console.log(`\n📌 Đăng nhập bằng ${YOUR_EMAIL} rồi vào link trên để xem UI.`)
  } else {
    console.log(`\n📌 Đăng nhập bằng bất kỳ tài khoản nào và vào link trên.`)
    console.log(`   (Bạn sẽ vào với tư cách Spectator nếu không phải 1 trong ${allUsers.length} bot)`)
  }
  console.log('\n🧹 Dọn dẹp sau khi test:')
  console.log(`   Xoá phòng: DELETE FROM rooms WHERE code = '${roomCode}';`)
  console.log('   (cascade sẽ xoá session, players, votes, chat tự động)\n')
}

function buildRoles(count) {
  const r = { wolf: 0, villager: 0, seer: 1, guard: 0, witch: 0, hunter: 0 }
  r.wolf = count <= 6 ? 1 : count <= 9 ? 2 : 3
  if (count >= 6) r.guard = 1
  if (count >= 7) r.witch = 1
  if (count >= 8) r.hunter = 1
  const assigned = Object.values(r).reduce((a, b) => a + b, 0)
  r.villager = Math.max(1, count - assigned)
  return r
}

main().catch(e => {
  console.error('\n❌ Lỗi:', e.message)
  process.exit(1)
})
