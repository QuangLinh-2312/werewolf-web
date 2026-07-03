# 🐺 Werewolf Online — Ma Sói Web App

Web chơi **Ma Sói (Werewolf/Mafia)** online cùng bạn bè, realtime, miễn phí 100% (free tier).

---

## 1. Mục tiêu dự án

- Chơi Ma Sói online, không cần cài app, không cần MC (bot dẫn chuyện tự động theo pha đêm/ngày).
- Tối ưu để build nhanh, chi phí vận hành = 0đ (free tier Supabase + Vercel).
- Ưu tiên trải nghiệm trên mobile (bạn bè thường vào bằng điện thoại khi tụ tập).

---

## 2. Tech Stack

| Hạng mục | Công nghệ | Ghi chú |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Components + Server Actions |
| Ngôn ngữ | TypeScript | strict mode |
| UI | Tailwind CSS + shadcn/ui | dark mode mặc định (chơi đêm nhiều 🌙) |
| Database & Realtime | Supabase (Postgres + Realtime + Auth) | free tier |
| Deploy | Vercel | free tier |
| Quản lý trạng thái | React Context + `useReducer` | 1 context cho Room/Game state, 1 cho Auth |
| Validation | Zod | dùng chung schema FE/BE |
| Form | React Hook Form (+ Zod resolver) | |
| Âm thanh (tùy chọn) | Howler.js | tiếng gà gáy, tiếng sói tru... |

> 💡 Không dùng Redux/Zustand để giữ đúng yêu cầu "React Context", nhưng tách 2 context riêng (`AuthContext`, `GameContext`) để tránh re-render toàn bộ cây khi state game thay đổi liên tục.

---

## 3. Phạm vi tính năng (Feature Scope)

### 3.1 Tài khoản (Auth)
- [ ] Đăng ký / đăng nhập bằng Email + Password (Supabase Auth)
- [ ] Đăng nhập bằng Google OAuth (khuyến nghị vì nhanh cho bạn bè)
- [ ] Chế độ **khách (Guest)**: chỉ nhập nickname, không cần tài khoản (dùng `anon sign-in` của Supabase) — quan trọng vì bạn bè không muốn đăng ký chỉ để chơi 1 ván
- [ ] Trang hồ sơ cá nhân: nickname, avatar (chọn từ bộ có sẵn hoặc upload), thống kê (số ván thắng/thua, vai hay chơi nhất)
- [ ] Cập nhật nickname/avatar

### 3.2 Sảnh & Phòng chơi (Lobby & Room)
- [ ] Tạo phòng → sinh **mã phòng 6 ký tự** (dễ đọc, tránh nhầm lẫn O/0, I/1)
- [ ] Tham gia phòng bằng mã phòng
- [ ] Danh sách người chơi trong phòng realtime (avatar, trạng thái sẵn sàng, "đang gõ...")
- [ ] Chủ phòng (Host): có quyền kick người chơi, cấu hình vai trò, bắt đầu game, chuyển quyền host
- [ ] Presence: tự động đánh dấu offline/disconnect (Supabase Realtime Presence), tự gán lại host nếu host rời phòng
- [ ] Trạng thái "sẵn sàng" (Ready) trước khi host start game
- [ ] Giới hạn số người chơi: 6–20 người (tùy cấu hình)
- [ ] Chat sảnh chờ trước khi vào game

### 3.3 Cấu hình ván chơi (Game Setup)
- [ ] Host chọn bộ vai trò theo số lượng người chơi (auto-suggest tỉ lệ Sói/Dân hợp lý, ví dụ 1 Sói / 4-5 Dân)
- [ ] Cấu hình thời gian mỗi pha (thảo luận ngày, bỏ phiếu, đêm...)
- [ ] Bật/tắt tính năng: cho phép nói lại sau khi chết (ghost chat riêng), cho phép Sói chat riêng ban đêm, chế độ "một mạng" (không hồi sinh)
- [ ] Random gán vai trò cho người chơi khi bắt đầu (thuật toán shuffle công bằng, chạy ở server/DB function để tránh gian lận)

### 3.4 Vai trò (Roles) — MVP tối thiểu
| Phe | Vai trò | Khả năng |
|---|---|---|
| Sói | 🐺 Sói thường | Đêm: chọn giết 1 người, chat riêng với đồng đội |
| Sói | 🐺 Sói ẩn / Phù thủy sói (mở rộng) | Biến thể nâng cao |
| Dân | 👤 Dân làng | Không có khả năng đặc biệt, chỉ bỏ phiếu ban ngày |
| Dân | 🔮 Tiên tri (Seer) | Đêm: soi 1 người để biết là Sói hay không |
| Dân | 🛡️ Bảo vệ (Guard/Bodyguard) | Đêm: bảo vệ 1 người khỏi bị giết (không được bảo vệ trùng người 2 đêm liên tiếp) |
| Dân | 🧪 Phù thủy (Witch) | Có 1 bình cứu + 1 bình độc, dùng 1 lần mỗi loại |
| Dân | 🏹 Thợ săn (Hunter) | Khi chết, được bắn theo 1 người khác |
| Dân | 💘 Cupid | Đêm đầu: ghép 1 cặp đôi, 1 người chết thì người kia cũng chết theo |
| Trung lập | 🤡 Thằng ngố (Tanner, mở rộng) | Thắng nếu bị dân làng treo cổ |

> Kiến trúc vai trò nên thiết kế dạng **plugin/config-driven** (mỗi vai = 1 object định nghĩa `nightAction`, `priority`, `winCondition`) để dễ thêm vai trò mới sau này mà không sửa core game engine.

### 3.5 Luồng chơi (Game Flow / State Machine)
Vòng lặp pha (phase loop), mỗi ván gồm nhiều "Ngày" (Day N):

```
setup → night_intro → night_actions → night_resolve → day_result
  → day_discussion → day_vote → day_vote_result → (check win) → night_intro (lặp lại)
  ↘ game_over
```

- [ ] **Ban đêm**: lần lượt "mời" từng vai trò hành động theo thứ tự ưu tiên (Cupid → Sói → Bảo vệ → Tiên tri → Phù thủy...), người không có vai đó thì màn hình hiện "Cả làng đang ngủ..."
- [ ] **Đầu ngày**: công bố kết quả đêm qua (ai chết, hiệu ứng đặc biệt)
- [ ] **Thảo luận ngày**: chat công khai, đếm giờ
- [ ] **Bỏ phiếu**: vote treo cổ, xử lý hòa phiếu (vote lại / không ai chết)
- [ ] **Kiểm tra điều kiện thắng** sau mỗi lần có người chết: phe Sói thắng khi số Sói ≥ số Dân còn lại; phe Dân thắng khi hết Sói
- [ ] Người chết chuyển sang chế độ **khán giả/ma (spectator)**: xem được diễn biến nhưng không tương tác, có kênh chat ma riêng (tùy chọn)
- [ ] Màn hình kết thúc game: công bố toàn bộ vai trò, ai thắng, thống kê ván đấu
- [ ] Chơi lại (rematch) giữ nguyên phòng và người chơi

### 3.6 Realtime & Chat
- [ ] Kênh chat chung (ban ngày, mọi người)
- [ ] Kênh chat riêng phe Sói (chỉ ban đêm, chỉ Sói thấy)
- [ ] Kênh chat ma (người đã chết)
- [ ] Đồng bộ trạng thái game realtime cho toàn bộ người chơi (Supabase Realtime Channel theo `room_id`)
- [ ] Timer đồng bộ giữa các client (server tính giờ, client chỉ hiển thị đếm ngược dựa trên `phase_ends_at`)

### 3.7 Khác
- [ ] Responsive, tối ưu mobile-first (đa số chơi bằng điện thoại)
- [ ] PWA (tùy chọn, thêm sau) để "Add to Home Screen"
- [ ] Lịch sử ván đấu cá nhân
- [ ] Âm thanh/hiệu ứng khi chuyển pha (tùy chọn)

---

## 4. Cấu trúc thư mục (đề xuất)

```
werewolf-web/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (main)/
│   │   ├── page.tsx                # Trang chủ / tạo-tham gia phòng
│   │   ├── profile/page.tsx
│   │   └── history/page.tsx
│   ├── room/[roomCode]/
│   │   ├── lobby/page.tsx          # Sảnh chờ trong phòng
│   │   └── game/page.tsx           # Màn hình chơi chính
│   ├── api/                        # Route handlers (nếu cần webhook, cron...)
│   └── layout.tsx
├── components/
│   ├── ui/                         # shadcn/ui components
│   ├── game/
│   │   ├── RoleCard.tsx
│   │   ├── PlayerList.tsx
│   │   ├── NightActionPanel.tsx
│   │   ├── VotePanel.tsx
│   │   ├── ChatBox.tsx
│   │   └── PhaseTimer.tsx
│   └── room/
├── contexts/
│   ├── AuthContext.tsx
│   └── GameContext.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # browser client
│   │   ├── server.ts                # server client (Server Components/Actions)
│   │   └── middleware.ts
│   ├── game-engine/
│   │   ├── roles/                   # config-driven role definitions
│   │   ├── phase-machine.ts         # state machine xử lý chuyển pha
│   │   ├── win-condition.ts
│   │   └── assign-roles.ts
│   └── validators/                  # Zod schemas
├── hooks/
│   ├── useRoomRealtime.ts
│   ├── useGameState.ts
│   └── usePresence.ts
├── types/
│   └── database.types.ts            # generate từ Supabase CLI
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── middleware.ts                    # bảo vệ route cần auth
└── README.md
```

---

## 5. Thiết kế Database (Supabase / Postgres)

### Bảng chính

**`profiles`** (mở rộng từ `auth.users`)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid (PK, FK → auth.users) | |
| nickname | text | |
| avatar_url | text | |
| is_guest | boolean | |
| wins | int | |
| losses | int | |
| created_at | timestamptz | |

**`rooms`**
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid (PK) | |
| code | text (unique) | mã phòng 6 ký tự |
| host_id | uuid (FK → profiles) | |
| status | text | `lobby` \| `playing` \| `finished` |
| settings | jsonb | cấu hình vai trò, thời gian pha |
| created_at | timestamptz | |

**`room_players`**
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid (PK) | |
| room_id | uuid (FK) | |
| profile_id | uuid (FK) | |
| is_ready | boolean | |
| is_connected | boolean | |
| joined_at | timestamptz | |

**`game_sessions`**
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid (PK) | |
| room_id | uuid (FK) | |
| phase | text | pha hiện tại trong state machine |
| day_number | int | |
| phase_ends_at | timestamptz | dùng để đồng bộ timer client |
| winner | text | `wolves` \| `villagers` \| null |
| started_at / ended_at | timestamptz | |

**`game_players`** (người chơi trong 1 ván cụ thể — tách khỏi `room_players` vì có thể chơi lại nhiều ván trong 1 phòng)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid (PK) | |
| session_id | uuid (FK) | |
| profile_id | uuid (FK) | |
| role | text | |
| is_alive | boolean | |
| died_at_phase | text \| null | |

**`night_actions`**
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid (PK) | |
| session_id | uuid (FK) | |
| day_number | int | |
| actor_id | uuid (FK → game_players) | |
| action_type | text | `kill`, `save`, `check`, `protect`... |
| target_id | uuid (FK → game_players, nullable) | |

**`votes`**
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid (PK) | |
| session_id | uuid | |
| day_number | int | |
| voter_id | uuid (FK) | |
| target_id | uuid (FK, nullable) | null = bỏ phiếu trắng |

**`chat_messages`**
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid (PK) | |
| session_id | uuid | |
| channel | text | `public` \| `wolves` \| `ghost` |
| sender_id | uuid | |
| content | text | |
| created_at | timestamptz | |

### Row Level Security (RLS) — bắt buộc vì đây là game đối kháng
- `chat_messages` kênh `wolves`: chỉ SELECT được nếu `sender_id` hoặc người đọc có `role` thuộc phe Sói trong `game_players` của session đó.
- `game_players.role`: **KHÔNG** để client tự do SELECT cột `role` của người khác — dùng Postgres **view** hoặc **RPC function** trả về role đã được che (`***`) trừ khi: (a) là chính mình, (b) game đã kết thúc, (c) người xem đã chết (ghost xem được hết — tùy luật).
- `night_actions`: chỉ chủ hành động (`actor_id`) mới SELECT/INSERT được hành động của chính họ.
- Toàn bộ **logic random chia bài, tính kết quả đêm, kiểm tra thắng thua** nên chạy trong **Postgres Function (RPC)** chạy với quyền `security definer`, không tính toán ở client — tránh gian lận (client có thể sửa code JS để gian lận nếu logic nằm ở FE).

---

## 6. Kiến trúc Realtime (Supabase)

- Mỗi phòng = 1 Supabase Realtime Channel: `room:{room_id}`
- Broadcast events: `phase_changed`, `player_died`, `vote_update`, `chat_message`
- Presence dùng để hiển thị online/offline + typing indicator
- Postgres Changes (CDC) subscribe trên bảng `game_sessions`, `game_players`, `votes` để tự đồng bộ UI khi có INSERT/UPDATE
- Timer: server ghi `phase_ends_at`, client chỉ `setInterval` để hiển thị đếm ngược — khi hết giờ, **bất kỳ client nào** (hoặc 1 Edge Function cron/Vercel Cron) gọi RPC `advance_phase()` để đảm bảo đồng bộ dù có người mất kết nối

---

## 7. Biến môi trường (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # chỉ dùng ở server, không lộ ra client
NEXT_PUBLIC_SITE_URL=
```

---

## 8. Kế hoạch triển khai (Roadmap đề xuất)

**Giai đoạn 1 — Nền tảng**
1. Setup Next.js 15 + TS + Tailwind + shadcn/ui
2. Setup Supabase project, schema, RLS cơ bản
3. Auth: Guest mode + Email login

**Giai đoạn 2 — Phòng chơi**
4. Tạo/tham gia phòng, realtime player list, presence
5. Cấu hình vai trò, host controls

**Giai đoạn 3 — Game Engine (MVP)**
6. State machine pha đêm/ngày (chỉ Sói + Dân + Tiên tri trước)
7. Night actions + resolve + win condition
8. Vote ban ngày

**Giai đoạn 4 — Mở rộng**
9. Thêm vai trò: Bảo vệ, Phù thủy, Thợ săn, Cupid
10. Chat riêng theo phe, chat ma
11. Lịch sử ván đấu, thống kê profile

**Giai đoạn 5 — Polish**
12. Responsive/mobile polish, âm thanh, animation chuyển pha
13. PWA, chia sẻ link mời nhanh (deep link kèm mã phòng)

---

## 9. Quy ước code

- Đặt tên vai trò/hành động bằng key tiếng Anh (`seer`, `guard`...) để dễ i18n sau này, hiển thị tiếng Việt qua 1 file `dictionary.ts`
- Toàn bộ logic thắng-thua, chia vai, xử lý đêm chạy ở **Supabase RPC function**, không tin dữ liệu từ client
- Dùng Zod validate mọi input trước khi gọi Server Action/RPC
- Đặt tên Server Actions rõ nghĩa: `submitNightAction`, `castVote`, `advancePhase`...

---

## 10. Ghi chú Free-tier

- Supabase free tier: 500MB DB, realtime connections giới hạn — đủ dùng cho nhóm bạn bè (vài chục người/phòng vài chục phòng)
- Vercel free tier: đủ cho hobby project, chú ý Edge Function/Cron nếu dùng để auto-advance phase có giới hạn số lần chạy
