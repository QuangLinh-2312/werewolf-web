// scripts/autoplay-game.mjs
// Tự động chơi 1 ván hoàn chỉnh với bot, in từng bước ra terminal
// Mở link game trong browser để xem UI cập nhật realtime
//
// Chạy: node scripts/autoplay-game.mjs [số_người=6] [delay_ms=2000]
// VD:   node scripts/autoplay-game.mjs 7 1500
//
// Yêu cầu: .env.local có SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Load .env.local ────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dir, '../.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.trim().split('=').map(s => s.trim()))
)
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY']
const SITE_URL     = env['NEXT_PUBLIC_SITE_URL'] || 'http://localhost:3000'

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ── Config ──────────────────────────────────────────────────────────────
const PLAYER_COUNT = parseInt(process.argv[2] ?? '6')
const DELAY_MS     = parseInt(process.argv[3] ?? '2000') // ms giữa mỗi phase
const NICKNAMES    = ['Sói Xám','Tiên Tri','Phù Thủy','Bảo Vệ','Thợ Săn','Cupid','Dân Làng A','Dân Làng B','Dân Làng C','Dân Làng D']

// ── Utils ───────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))
const rand  = arr => arr[Math.floor(Math.random() * arr.length)]

function phase_icon(phase) {
  const map = { night_intro:'🌙', night_actions:'🔮', night_resolve:'⚙️',
    day_result:'☀️', day_discussion:'🗣️', day_vote:'⚖️',
    day_vote_result:'📣', game_over:'🏆' }
  return map[phase] ?? '❓'
}

function role_icon(role) {
  const map = { wolf:'🐺', villager:'👤', seer:'🔮', guard:'🛡️',
    witch:'🧪', hunter:'🏹', cupid:'💘', elder:'👴',
    jester:'🃏', alpha_wolf:'🐺🔮', silencer:'🔇',
    detective:'🕵️', avenger_wolf:'🐺💀', doppelganger:'🤡' }
  return map[role] ?? '❓'
}

async function rq(table, op, ...args) {
  const { data, error } = await sb.from(table)[op](...args)
  if (error) throw new Error(`${table}.${op}: ${error.message}`)
  return data
}

// ── Phase advancement (service role → bypass advance_phase auth check) ──
// advance_phase kiểm tra auth.uid() — service role không có → gọi trực tiếp
async function advancePhase(sessionId, currentPhase, dayNum) {
  switch (currentPhase) {
    case 'night_intro':
      await sb.from('game_sessions').update({
        phase: 'night_actions',
        phase_ends_at: new Date(Date.now() - 1000).toISOString()
      }).eq('id', sessionId)
      break

    case 'night_actions':
      // resolve_night không check auth.uid() → gọi trực tiếp được
      {
        const { error } = await sb.rpc('resolve_night', { p_session_id: sessionId })
        if (error) throw new Error(`resolve_night: ${error.message}`)
      }
      break

    case 'day_result':
      await sb.from('game_sessions').update({
        phase: 'day_discussion',
        phase_ends_at: new Date(Date.now() - 1000).toISOString()
      }).eq('id', sessionId)
      break

    case 'day_discussion':
      await sb.from('game_sessions').update({
        phase: 'day_vote',
        phase_ends_at: new Date(Date.now() - 1000).toISOString()
      }).eq('id', sessionId)
      break

    case 'day_vote':
      // resolve_vote không check auth.uid() → gọi trực tiếp được
      {
        const { error } = await sb.rpc('resolve_vote', { p_session_id: sessionId })
        if (error) throw new Error(`resolve_vote: ${error.message}`)
      }
      break

    case 'day_vote_result': {
      // Kiểm tra game đã over chưa trước khi sang ngày mới
      const { data: s } = await sb.from('game_sessions').select('phase').eq('id', sessionId).single()
      if (s?.phase === 'game_over') break
      await sb.from('game_sessions').update({
        phase: 'night_intro',
        day_number: dayNum + 1,
        phase_ends_at: new Date(Date.now() - 1000).toISOString()
      }).eq('id', sessionId)
      break
    }
  }
}

async function getSession(sessionId) {
  const { data } = await sb.from('game_sessions').select('*').eq('id', sessionId).single()
  return data
}

async function getAlivePlayers(sessionId) {
  const { data } = await sb.from('game_players')
    .select('*, profiles(nickname)')
    .eq('session_id', sessionId)
    .eq('is_alive', true)
  return data ?? []
}

async function getAllPlayers(sessionId) {
  const { data } = await sb.from('game_players')
    .select('*, profiles(nickname)')
    .eq('session_id', sessionId)
  return data ?? []
}

// ── Bot actions ─────────────────────────────────────────────────────────
async function doNightActions(sessionId, dayNum) {
  const alive = await getAlivePlayers(sessionId)
  const wolves  = alive.filter(p => ['wolf','alpha_wolf','avenger_wolf'].includes(p.role))
  const nonWolf = alive.filter(p => !['wolf','alpha_wolf','avenger_wolf'].includes(p.role))
  const seer    = alive.find(p => p.role === 'seer')
  const guard   = alive.find(p => p.role === 'guard')
  const witch   = alive.find(p => ['witch'].includes(p.role))

  const actions = []

  // 🐺 Wolves: vote cùng target (random non-wolf)
  if (wolves.length > 0 && nonWolf.length > 0) {
    const target = rand(nonWolf)
    for (const wolf of wolves) {
      actions.push({ session_id: sessionId, day_number: dayNum, actor_id: wolf.id, action_type: 'kill', target_id: target.id })
      console.log(`  🐺 ${wolf.profiles?.nickname} cắn → ${target.profiles?.nickname}`)
    }
  }

  // 🔮 Seer: soi random non-wolf
  if (seer && nonWolf.length > 0) {
    const target = rand(alive.filter(p => p.id !== seer.id))
    actions.push({ session_id: sessionId, day_number: dayNum, actor_id: seer.id, action_type: 'check', target_id: target.id })
    const isWolf = ['wolf','alpha_wolf','avenger_wolf'].includes(target.role)
    console.log(`  🔮 ${seer.profiles?.nickname} soi → ${target.profiles?.nickname} [${isWolf ? '🐺 SÓI' : '✅ SẠCH'}]`)
  }

  // 🛡️ Guard: bảo vệ random
  if (guard && alive.length > 1) {
    const candidates = alive.filter(p => p.id !== guard.id)
    const target = rand(candidates)
    actions.push({ session_id: sessionId, day_number: dayNum, actor_id: guard.id, action_type: 'protect', target_id: target.id })
    console.log(`  🛡️ ${guard.profiles?.nickname} bảo vệ → ${target.profiles?.nickname}`)
  }

  // 🧪 Witch: 50% cứu người bị cắn, bỏ qua độc để đơn giản
  if (witch && wolves.length > 0 && nonWolf.length > 0) {
    const killTarget = actions.find(a => a.action_type === 'kill')?.target_id
    if (killTarget && Math.random() > 0.5) {
      actions.push({ session_id: sessionId, day_number: dayNum, actor_id: witch.id, action_type: 'save', target_id: killTarget })
      const name = alive.find(p => p.id === killTarget)?.profiles?.nickname
      console.log(`  🧪 ${witch.profiles?.nickname} cứu → ${name}`)
    } else {
      console.log(`  🧪 ${witch.profiles?.nickname} bỏ qua đêm nay`)
    }
  }

  // Insert tất cả actions (service role bypass RLS)
  if (actions.length > 0) {
    const { error } = await sb.from('night_actions').upsert(actions, {
      onConflict: 'session_id,day_number,actor_id,action_type',
      ignoreDuplicates: false,
    })
    if (error) throw new Error(`Insert night_actions: ${error.message}`)
  }
}

async function doVotes(sessionId, dayNum) {
  const alive = await getAlivePlayers(sessionId)
  if (alive.length < 2) return

  const votes = []
  for (const voter of alive) {
    // Bot vote random người khác (wolves ưu tiên vote non-wolf để giả vờ)
    const candidates = alive.filter(p => p.id !== voter.id)
    const target = rand(candidates)
    votes.push({ session_id: sessionId, day_number: dayNum, voter_id: voter.id, target_id: target.id })
    console.log(`  🗳️ ${voter.profiles?.nickname.padEnd(12)} → ${target.profiles?.nickname}`)
  }

  const { error } = await sb.from('votes').upsert(votes, {
    onConflict: 'session_id,day_number,voter_id',
    ignoreDuplicates: false,
  })
  if (error) throw new Error(`Insert votes: ${error.message}`)
}

async function printState(sessionId) {
  const players = await getAllPlayers(sessionId)
  const alive = players.filter(p => p.is_alive)
  const dead  = players.filter(p => !p.is_alive)
  if (alive.length) console.log(`  Còn sống: ${alive.map(p => `${role_icon(p.role)}${p.profiles?.nickname}`).join(', ')}`)
  if (dead.length)  console.log(`  Đã chết : ${dead.map(p => `💀${p.profiles?.nickname}`).join(', ')}`)
}

// ── SETUP: tạo phòng + players ──────────────────────────────────────────
async function setup() {
  console.log('\n🐺 Werewolf AutoPlay Bot')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`👥 ${PLAYER_COUNT} người chơi | ⏱️ ${DELAY_MS}ms/phase\n`)

  // Tạo users
  const users = []
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const nick = NICKNAMES[i % NICKNAMES.length] + (i >= NICKNAMES.length ? `_${i}` : '')
    const { data, error } = await sb.auth.admin.createUser({
      email: `bot-${Date.now()}-${i}@autoplay.local`,
      password: 'autoplay-pass',
      email_confirm: true,
      user_metadata: { nickname: nick },
    })
    if (error) throw new Error(`Tạo user: ${error.message}`)
    // Chờ trigger tạo profile
    for (let r = 0; r < 10; r++) {
      const { data: p } = await sb.from('profiles').select('id').eq('id', data.user.id).single()
      if (p) break
      await sleep(300)
    }
    users.push(data.user)
    process.stdout.write('.')
  }
  console.log(` ✅ ${PLAYER_COUNT} bots\n`)

  // Tạo phòng
  const code = Math.random().toString(36).slice(2, 8).toUpperCase()
  const host = users[0]
  const { data: room } = await sb.from('rooms').insert({
    code, host_id: host.id, status: 'lobby'
  }).select().single()

  await sb.from('room_players').insert(users.map(u => ({
    room_id: room.id, profile_id: u.id, is_ready: true
  })))

  // Gán vai
  const roles = buildRoles(users.length)
  const pool = Object.entries(roles).flatMap(([r, n]) => Array(n).fill(r))
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }

  const { data: session } = await sb.from('game_sessions').insert({
    room_id: room.id, phase: 'night_intro', day_number: 1,
    phase_ends_at: new Date(Date.now() - 1000).toISOString()
  }).select().single()

  await sb.from('game_players').insert(users.map((u, i) => ({
    session_id: session.id, profile_id: u.id, role: pool[i], is_alive: true
  })))
  await sb.from('rooms').update({ status: 'playing' }).eq('id', room.id)

  console.log(`🔗 ${SITE_URL}/room/${code}/game`)
  console.log(`📋 Phòng: ${code} | Session: ${session.id.slice(0,8)}...\n`)
  console.log('🃏 Phân vai:')
  users.forEach((u, i) => {
    const nick = u.user_metadata?.nickname ?? u.email
    console.log(`   ${role_icon(pool[i])} ${nick.padEnd(14)} → ${pool[i]}`)
  })
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('⏸️  Mở link trên trong browser rồi nhấn Enter để bắt đầu...')
  await new Promise(r => process.stdin.once('data', r))
  process.stdin.pause()

  return { session, room, code }
}

// ── MAIN GAME LOOP ──────────────────────────────────────────────────────
async function gameLoop(sessionId, code) {
  let round = 0
  while (true) {
    const sess = await getSession(sessionId)
    if (!sess) break

    const icon = phase_icon(sess.phase)
    console.log(`\n${icon} Phase: ${sess.phase.toUpperCase()} | Ngày ${sess.day_number}`)

    if (sess.phase === 'game_over') {
      console.log(`\n🏆 KẾT THÚC! Người thắng: ${sess.winner?.toUpperCase() ?? 'N/A'}`)
      await printState(sessionId)
      break
    }

    if (sess.phase === 'night_intro') {
      console.log('  🌙 Đêm bắt đầu...')
      await sleep(DELAY_MS)
      await advancePhase(sessionId, sess.phase, sess.day_number) // → night_actions
    }
    else if (sess.phase === 'night_actions') {
      console.log('  🤫 Bots đang thực hiện hành động đêm...')
      const s2 = await getSession(sessionId)
      await doNightActions(sessionId, s2.day_number)
      await sleep(DELAY_MS)
      await advancePhase(sessionId, s2.phase, s2.day_number) // → resolve_night → day_result
    }
    else if (sess.phase === 'day_result') {
      console.log('  ☀️ Công bố kết quả đêm...')
      await printState(sessionId)
      await sleep(DELAY_MS)
      await advancePhase(sessionId, sess.phase, sess.day_number) // → day_discussion
    }
    else if (sess.phase === 'day_discussion') {
      console.log('  🗣️ Bot đang "thảo luận"...')
      await sleep(DELAY_MS)
      await advancePhase(sessionId, sess.phase, sess.day_number) // → day_vote
    }
    else if (sess.phase === 'day_vote') {
      console.log('  ⚖️ Bots đang bỏ phiếu...')
      const s2 = await getSession(sessionId)
      await doVotes(sessionId, s2.day_number)
      await sleep(DELAY_MS)
      await advancePhase(sessionId, s2.phase, s2.day_number) // → resolve_vote → day_vote_result
    }
    else if (sess.phase === 'day_vote_result') {
      console.log('  📣 Công bố kết quả bỏ phiếu...')
      await printState(sessionId)
      await sleep(DELAY_MS)
      await advancePhase(sessionId, sess.phase, sess.day_number) // → night_intro (ngày mới)
    }

    round++
    if (round > 50) { console.log('⚠️ Vượt 50 rounds, dừng an toàn'); break }
  }
}

function buildRoles(count) {
  const r = { wolf: 0, villager: 0, seer: 1, guard: 0, witch: 0, hunter: 0 }
  r.wolf = count <= 6 ? 1 : count <= 9 ? 2 : 3
  if (count >= 6) r.guard = 1
  if (count >= 7) r.witch = 1
  if (count >= 8) r.hunter = 1
  const totalSp = Object.values(r).reduce((a, b) => a + b, 0)
  r.villager = Math.max(1, count - totalSp)
  return r
}

// ── RUN ─────────────────────────────────────────────────────────────────
async function main() {
  const { session, code } = await setup()
  await gameLoop(session.id, code)
  console.log(`\n🧹 Dọn dẹp:\n   DELETE FROM rooms WHERE code = '${code}';\n`)
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })
