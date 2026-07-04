import type { GamePhase, RoleKey } from '@/types/database.types'

export interface RoleDefinition {
  key: RoleKey
  name: string
  emoji: string
  alliance: 'Dân làng' | 'Ma Sói' | 'Trung lập'
  team: 'villagers' | 'wolves' | 'neutral'
  tagline: string
  description: string
  nightAbility: string | null
  dayAbility: string
  winCondition: string
  tips: string[]
  nightActionLabel?: string
  canActAtNight: boolean
  nightPhases: GamePhase[]
  color: string
  cardBg: string
  accent: string
}

export const ROLE_DEFINITIONS: Partial<Record<RoleKey, RoleDefinition>> = {
  wolf: {
    key: 'wolf',
    name: 'Ma Sói',
    emoji: '🐺',
    alliance: 'Ma Sói',
    team: 'wolves',
    tagline: 'Săn mồi trong bóng tối',
    description:
      'Ban ngày bạn trà trộn vào dân làng. Ban đêm, cùng bầy sói chọn một nạn nhân để cắn. Nếu có nhiều sói, phiếu cắn trùng nhau mới có hiệu lực.',
    nightAbility: 'Ban đêm: chọn 1 người chơi còn sống để cắn.',
    dayAbility: 'Ban ngày: thảo luận và bỏ phiếu treo cổ — đừng để lộ mình.',
    winCondition: 'Phe Sói thắng khi số Sói còn sống ≥ số Dân còn sống.',
    tips: [
      'Thống nhất mục tiêu cắn với sói khác qua kênh chat Sói ban đêm.',
      'Ban ngày hãy im lặng hoặc đổ lỗi sang người khác.',
      'Cẩn thận Tiên Tri và Phù Thủy.',
    ],
    nightActionLabel: 'Chọn nạn nhân cắn',
    canActAtNight: true,
    nightPhases: ['night_actions'],
    color: 'text-red-400 border-red-700/50 bg-red-950/30',
    cardBg: 'from-red-950/40 via-zinc-900 to-zinc-950',
    accent: 'red',
  },
  villager: {
    key: 'villager',
    name: 'Dân Làng',
    emoji: '👤',
    alliance: 'Dân làng',
    team: 'villagers',
    tagline: 'Người bảo vệ làng',
    description:
      'Bạn không có năng lực ban đêm. Sức mạnh của bạn nằm ở khả năng quan sát, thảo luận và bỏ phiếu treo cổ đúng người.',
    nightAbility: null,
    dayAbility: 'Ban ngày: thảo luận công khai và bỏ phiếu treo cổ nghi phạm.',
    winCondition: 'Phe Dân thắng khi tiêu diệt hết Ma Sói.',
    tips: [
      'Ghi nhớ ai nói gì trong các vòng thảo luận.',
      'Đừng treo cổ vội vàng — hòa phiếu thì không ai chết.',
      'Tin tưởng Tiên Tri nếu họ đã soi đúng.',
    ],
    canActAtNight: false,
    nightPhases: [],
    color: 'text-zinc-300 border-zinc-600/50 bg-zinc-900/40',
    cardBg: 'from-zinc-900 via-zinc-950 to-zinc-900',
    accent: 'zinc',
  },
  seer: {
    key: 'seer',
    name: 'Tiên Tri',
    emoji: '🔮',
    alliance: 'Dân làng',
    team: 'villagers',
    tagline: 'Người soi sáng sự thật',
    description:
      'Mỗi đêm bạn được soi một người chơi. Kết quả chỉ cho biết họ là Ma Sói hay không phải Ma Sói (các vai đặc biệt khác hiện như Dân).',
    nightAbility: 'Ban đêm: chọn 1 người để soi — kết quả hiện ngay sau khi chọn.',
    dayAbility: 'Ban ngày: dẫn dắt dân làng bỏ phiếu (cẩn thận không lộ mình quá sớm).',
    winCondition: 'Phe Dân thắng khi tiêu diệt hết Ma Sói.',
    tips: [
      'Đừng công khai vai trò ngay — Sói sẽ cắn bạn đêm sau.',
      'Ghi chép kết quả soi từng đêm.',
      'Có thể nói gián tiếp: "Tôi tin người X là sạch".',
    ],
    nightActionLabel: 'Soi bài người chơi',
    canActAtNight: true,
    nightPhases: ['night_actions'],
    color: 'text-purple-400 border-purple-700/50 bg-purple-950/30',
    cardBg: 'from-purple-950/40 via-zinc-900 to-zinc-950',
    accent: 'purple',
  },
  guard: {
    key: 'guard',
    name: 'Bảo Vệ',
    emoji: '🛡️',
    alliance: 'Dân làng',
    team: 'villagers',
    tagline: 'Khiên chắn bảo vệ làng',
    description:
      'Mỗi đêm chọn một người để bảo vệ khỏi Sói cắn. Không được bảo vệ cùng một người hai đêm liên tiếp (có thể tự bảo vệ mình).',
    nightAbility: 'Ban đêm: chọn 1 người bảo vệ (không trùng đêm trước).',
    dayAbility: 'Ban ngày: thảo luận và bỏ phiếu.',
    winCondition: 'Phe Dân thắng khi tiêu diệt hết Ma Sói.',
    tips: [
      'Bảo vệ Tiên Tri hoặc người nghi ngờ sẽ bị cắn.',
      'Luân phiên mục tiêu bảo vệ để Sói khó đoán.',
      'Đừng bảo vệ cùng người 2 đêm liên tiếp.',
    ],
    nightActionLabel: 'Chọn người bảo vệ',
    canActAtNight: true,
    nightPhases: ['night_actions'],
    color: 'text-blue-400 border-blue-700/50 bg-blue-950/30',
    cardBg: 'from-blue-950/40 via-zinc-900 to-zinc-950',
    accent: 'blue',
  },
  witch: {
    key: 'witch',
    name: 'Phù Thủy',
    emoji: '🧪',
    alliance: 'Dân làng',
    team: 'villagers',
    tagline: 'Bình thuốc sinh tử',
    description:
      'Bạn có 1 bình cứu và 1 bình độc, mỗi loại dùng duy nhất một lần cả ván. Đêm nào cũng biết ai bị Sói cắn, rồi quyết định có cứu hay không.',
    nightAbility: 'Ban đêm: xem nạn nhân bị cắn → chọn cứu hoặc bỏ qua → chọn đầu độc hoặc bỏ qua.',
    dayAbility: 'Ban ngày: thảo luận và bỏ phiếu.',
    winCondition: 'Phe Dân thắng khi tiêu diệt hết Ma Sói.',
    tips: [
      'Thuốc cứu chỉ dùng 1 lần — cân nhắc kỹ đêm đầu.',
      'Thuốc độc có thể hạ Sói nếu biết chắc.',
      'Đừng lộ vai trò sớm.',
    ],
    nightActionLabel: 'Dùng thuốc cứu / độc',
    canActAtNight: true,
    nightPhases: ['night_actions'],
    color: 'text-emerald-400 border-emerald-700/50 bg-emerald-950/30',
    cardBg: 'from-emerald-950/40 via-zinc-900 to-zinc-950',
    accent: 'emerald',
  },
  hunter: {
    key: 'hunter',
    name: 'Thợ Săn',
    emoji: '🏹',
    alliance: 'Dân làng',
    team: 'villagers',
    tagline: 'Một phát súng cuối cùng',
    description:
      'Khi bị giết (đêm hoặc treo cổ), bạn được bắn một phát súng phục hận — kéo theo bất kỳ ai còn sống. Chỉ bắn được một lần duy nhất.',
    nightAbility: null,
    dayAbility: 'Ban ngày: thảo luận và bỏ phiếu. Khi chết: bắn 1 người còn sống.',
    winCondition: 'Phe Dân thắng khi tiêu diệt hết Ma Sói.',
    tips: [
      'Giữ vai trò kín — Sói sẽ tránh cắn bạn nếu biết.',
      'Khi chết, bắn người bạn chắc chắn nhất là Sói.',
      'Súng phục hận có thể đảo chiều ván đấu.',
    ],
    canActAtNight: false,
    nightPhases: [],
    color: 'text-amber-400 border-amber-700/50 bg-amber-950/30',
    cardBg: 'from-amber-950/40 via-zinc-900 to-zinc-950',
    accent: 'amber',
  },
  cupid: {
    key: 'cupid',
    name: 'Cupid',
    emoji: '💘',
    alliance: 'Trung lập',
    team: 'neutral',
    tagline: 'Người se duyên số phận',
    description:
      'Đêm đầu tiên, chọn 2 người chơi làm tình nhân. Nếu một người chết, người kia chết theo ngay lập tức.',
    nightAbility: 'Đêm 1: chọn 2 người ghép đôi tình nhân.',
    dayAbility: 'Ban ngày: thảo luận và bỏ phiếu như dân làng.',
    winCondition: 'Theo phe Dân làng (trừ khi chơi biến thể tình nhân thắng riêng).',
    tips: [
      'Ghép đôi sớm — chỉ được làm đêm 1.',
      'Tình nhân chết chùm có thể phá ván nhanh.',
      'Cân nhắc ghép 2 người mạnh hoặc 2 nghi phạm.',
    ],
    nightActionLabel: 'Ghép 2 tình nhân',
    canActAtNight: true,
    nightPhases: ['night_actions'],
    color: 'text-pink-400 border-pink-700/50 bg-pink-950/30',
    cardBg: 'from-pink-950/40 via-zinc-900 to-zinc-950',
    accent: 'pink',
  },
}

export function getRoleDefinition(roleKey: string): RoleDefinition {
  if (roleKey in ROLE_DEFINITIONS) {
    return ROLE_DEFINITIONS[roleKey as RoleKey]!
  }
  return ROLE_DEFINITIONS.villager!
}

// ─── Extended mode roles ──────────────────────────────────────────────────────

const EXTENDED_ROLE_DEFINITIONS: Partial<Record<RoleKey, RoleDefinition>> = {
  elder: {
    key: 'elder',
    name: 'Trưởng Làng',
    emoji: '👴',
    alliance: 'Dân làng',
    team: 'villagers',
    tagline: 'Sức chịu đựng phi thường',
    description:
      'Trưởng Làng có thể chịu được 1 lần bị Sói cắn mà không chết (lần đầu tiên). Lần thứ 2 bị cắn thì chết bình thường. Tuy nhiên, nếu bị treo cổ bởi dân làng, mất vĩnh viễn khả năng đặc biệt của tất cả Tiên Tri (kết quả soi bị ẩn từ đó).',
    nightAbility: null,
    dayAbility: 'Ban ngày: thảo luận và bỏ phiếu. Lần đầu bị cắn: sống sót.',
    winCondition: 'Phe Dân thắng khi tiêu diệt hết Ma Sói.',
    tips: [
      'Đừng để lộ mình là Trưởng Làng — Sói sẽ cắn 2 lần.',
      'Nếu bị treo cổ, Tiên Tri mất tác dụng — cộng đồng nên cẩn thận.',
      'Có thể đứng ra nhận vai trò công khai muộn hơn để đánh lạc hướng.',
    ],
    canActAtNight: false,
    nightPhases: [],
    color: 'text-orange-400 border-orange-700/50 bg-orange-950/30',
    cardBg: 'from-orange-950/40 via-zinc-900 to-zinc-950',
    accent: 'orange',
  },
  jester: {
    key: 'jester',
    name: 'Kẻ Điên',
    emoji: '🃏',
    alliance: 'Trung lập',
    team: 'neutral',
    tagline: 'Thắng bằng cách bị treo cổ',
    description:
      'Kẻ Điên thắng ngay lập tức nếu bị dân làng bỏ phiếu treo cổ. Không thuộc phe nào — mục tiêu là khiến dân làng nghi oan và treo cổ mình.',
    nightAbility: null,
    dayAbility: 'Ban ngày: cố tỏ ra đáng nghi để bị bỏ phiếu treo cổ.',
    winCondition: 'Thắng ngay khi bị treo cổ bởi vote của dân làng.',
    tips: [
      'Hành xử kỳ lạ, mâu thuẫn để bị nghi ngờ.',
      'Đừng bị Sói cắn chết — phải bị dân treo cổ mới thắng.',
      'Nếu ai đó xác nhận bạn là Kẻ Điên, dân làng sẽ không bỏ phiếu bạn nữa.',
    ],
    canActAtNight: false,
    nightPhases: [],
    color: 'text-violet-400 border-violet-700/50 bg-violet-950/30',
    cardBg: 'from-violet-950/40 via-zinc-900 to-zinc-950',
    accent: 'violet',
  },
  alpha_wolf: {
    key: 'alpha_wolf',
    name: 'Sói Tiên Tri',
    emoji: '🐺🔮',
    alliance: 'Ma Sói',
    team: 'wolves',
    tagline: 'Sói biết tất cả bí mật',
    description:
      'Ngoài việc cắn người như Sói thường, mỗi đêm Sói Tiên Tri còn được soi 1 người để biết vai trò thật của họ. Thông tin này chỉ Sói Tiên Tri biết.',
    nightAbility: 'Ban đêm: cắn 1 người (cùng bầy) + soi 1 người để biết vai thật.',
    dayAbility: 'Ban ngày: trà trộn vào dân làng, dùng thông tin soi để dẫn dắt phe Sói.',
    winCondition: 'Phe Sói thắng khi số Sói còn sống ≥ số Dân còn sống.',
    tips: [
      'Chia sẻ kết quả soi qua kênh chat Sói ban đêm.',
      'Soi Tiên Tri trước để vô hiệu hóa mối đe dọa lớn nhất.',
      'Cẩn thận — nếu bị soi bởi Tiên Tri dân làng, bạn sẽ bị lộ.',
    ],
    nightActionLabel: 'Cắn + Soi đêm nay',
    canActAtNight: true,
    nightPhases: ['night_actions'],
    color: 'text-red-400 border-red-700/50 bg-red-950/30',
    cardBg: 'from-red-950/40 via-zinc-900 to-zinc-950',
    accent: 'red',
  },
  silencer: {
    key: 'silencer',
    name: 'Phù Thủy Câm',
    emoji: '🔇',
    alliance: 'Dân làng',
    team: 'villagers',
    tagline: 'Bịt miệng kẻ nguy hiểm',
    description:
      'Mỗi đêm chọn 1 người — ngày hôm sau người đó không được gửi tin nhắn chat công khai. Không giết được ai nhưng cực kỳ hiệu quả để ngăn Ma Sói kêu oan hoặc dẫn dắt dư luận.',
    nightAbility: 'Ban đêm: chọn 1 người để câm lặng ngày hôm sau.',
    dayAbility: 'Ban ngày: thảo luận. Người bị câm sẽ thấy thông báo khi cố gửi tin nhắn.',
    winCondition: 'Phe Dân thắng khi tiêu diệt hết Ma Sói.',
    tips: [
      'Câm người mà bạn nghi nhất là Sói trước khi bỏ phiếu.',
      'Câm Alpha Wolf để ngăn thông tin soi rò rỉ.',
      'Đừng lộ vai — Sói sẽ ưu tiên tiêu diệt bạn.',
    ],
    nightActionLabel: 'Chọn người bị câm ngày mai',
    canActAtNight: true,
    nightPhases: ['night_actions'],
    color: 'text-slate-400 border-slate-700/50 bg-slate-950/30',
    cardBg: 'from-slate-950/40 via-zinc-900 to-zinc-950',
    accent: 'slate',
  },
  detective: {
    key: 'detective',
    name: 'Thám Tử',
    emoji: '🕵️',
    alliance: 'Dân làng',
    team: 'villagers',
    tagline: 'Tìm manh mối trong bóng tối',
    description:
      'Mỗi đêm điều tra 1 người — biết được họ thuộc phe Sói, phe Dân hay Trung lập. Khác với Tiên Tri, Thám Tử không bị nguyền bởi Trưởng Làng, và phân biệt được Trung lập.',
    nightAbility: 'Ban đêm: điều tra 1 người — kết quả: Sói / Dân / Trung lập.',
    dayAbility: 'Ban ngày: dùng thông tin điều tra để hướng dân làng bỏ phiếu.',
    winCondition: 'Phe Dân thắng khi tiêu diệt hết Ma Sói.',
    tips: [
      'Thám Tử phân biệt được Trung lập (Kẻ Điên, Cupid...) mà Tiên Tri không làm được.',
      'Kết hợp với Tiên Tri để xác nhận chéo kết quả.',
      'Không bị nguyền khi Trưởng Làng bị treo cổ.',
    ],
    nightActionLabel: 'Điều tra người chơi',
    canActAtNight: true,
    nightPhases: ['night_actions'],
    color: 'text-teal-400 border-teal-700/50 bg-teal-950/30',
    cardBg: 'from-teal-950/40 via-zinc-900 to-zinc-950',
    accent: 'teal',
  },
  avenger_wolf: {
    key: 'avenger_wolf',
    name: 'Sói Phục Hận',
    emoji: '🐺💀',
    alliance: 'Ma Sói',
    team: 'wolves',
    tagline: 'Chết nhưng không đơn độc',
    description:
      'Hoạt động như Sói thường ban đêm. Khi bị treo cổ ban ngày, ngẫu nhiên kéo theo 1 người còn sống chết cùng (không thể là Sói khác). Dân làng phải cân nhắc kỹ trước khi treo cổ.',
    nightAbility: 'Ban đêm: cắn 1 người (cùng bầy sói).',
    dayAbility: 'Ban ngày: khi bị treo cổ → kéo theo 1 người ngẫu nhiên chết.',
    winCondition: 'Phe Sói thắng khi số Sói còn sống ≥ số Dân còn sống.',
    tips: [
      'Công khai bạn là Sói khi biết chắc sẽ bị treo — kéo người quan trọng của dân.',
      'Đừng để lộ sớm — phần tử bất ngờ mới là sức mạnh.',
      'Kết hợp Alpha Wolf để biết ai quan trọng nhất để kéo.',
    ],
    nightActionLabel: 'Chọn nạn nhân cắn',
    canActAtNight: true,
    nightPhases: ['night_actions'],
    color: 'text-red-400 border-red-700/50 bg-red-950/30',
    cardBg: 'from-red-950/40 via-zinc-900 to-zinc-950',
    accent: 'red',
  },
  doppelganger: {
    key: 'doppelganger',
    name: 'Kẻ Nhân Bản',
    emoji: '🤡',
    alliance: 'Trung lập',
    team: 'neutral',
    tagline: 'Sống bằng vai trò người khác',
    description:
      'Đêm đầu tiên, chọn 1 người để "đánh dấu". Khi người đó chết (bất kỳ lý do nào), Kẻ Nhân Bản lập tức nhận vai trò của họ và chơi tiếp với vai đó — kể cả trở thành Sói hay Kẻ Điên.',
    nightAbility: 'Đêm 1: đánh dấu 1 người. Khi người đó chết → nhận vai của họ.',
    dayAbility: 'Ban ngày: thảo luận như dân làng cho đến khi người được đánh dấu chết.',
    winCondition: 'Thắng theo phe của vai được nhân bản.',
    tips: [
      'Đánh dấu người mạnh nhất (Tiên Tri, Phù Thủy) để kế thừa sức mạnh.',
      'Nếu đánh dấu Sói, bạn sẽ trở thành Sói — cẩn thận lộ thông tin.',
      'Đánh dấu Kẻ Điên là chiến thuật mạo hiểm nhưng có thể thắng nhanh.',
    ],
    nightActionLabel: 'Đánh dấu người sẽ nhân bản',
    canActAtNight: true,
    nightPhases: ['night_actions'],
    color: 'text-fuchsia-400 border-fuchsia-700/50 bg-fuchsia-950/30',
    cardBg: 'from-fuchsia-950/40 via-zinc-900 to-zinc-950',
    accent: 'fuchsia',
  },
}

// Merge extended roles vào ROLE_DEFINITIONS
Object.assign(ROLE_DEFINITIONS, EXTENDED_ROLE_DEFINITIONS)

export function getRoleDisplayName(roleKey: string): string {
  return getRoleDefinition(roleKey).name
}

// ─── Hệ thống balance ────────────────────────────────────────────────────────
// Mỗi vai có điểm "sức mạnh" (power score).
// Tổng điểm phe Sói phải xấp xỉ tổng điểm phe Dân để đảm bảo cân bằng.
// Công thức: wolf_score ≈ 0.45 × total_score (Sói có lợi thế ẩn danh nên ~45%)

export const ROLE_POWER: Record<RoleKey, number> = {
  // Phe Dân
  villager:      1,   // baseline
  guard:         2.5, // bảo vệ 1 người mỗi đêm — mạnh ổn định
  seer:          3,   // soi chính xác — cực kỳ mạnh nếu sống lâu
  hunter:        2,   // súng phục hận — 1 lần, giá trị cao
  witch:         3,   // 2 thuốc độc lập — rất mạnh đầu ván
  cupid:         1.5, // biến thể — có thể hại hoặc lợi
  elder:         2,   // 2 mạng + nguyền seer — phòng thủ tốt
  detective:     2.5, // soi đội không bị nguyền — thay thế seer tốt
  silencer:      2,   // câm miệng sói/người nguy hiểm — kiểm soát
  // Phe Sói
  wolf:          3,   // cắn mỗi đêm — nền tảng
  alpha_wolf:    4.5, // wolf + soi — cực mạnh thông tin
  avenger_wolf:  3.5, // wolf + kéo theo 1 người khi chết — khó xử
  // Trung lập
  jester:        1,   // thắng riêng — không đóng góp cho phe nào
  doppelganger:  2,   // biến đổi — khó đoán
}

// ─── Balance engine ───────────────────────────────────────────────────────────
/**
 * Tự động tính toán phân bổ vai cân bằng cho số người chơi nhất định.
 * Thuật toán:
 * 1. Tính số sói lý tưởng: ~25-30% người chơi (nhưng ít nhất 1, nhiều nhất 4)
 * 2. Ưu tiên các vai đặc biệt phe Dân để đối trọng sức mạnh phe Sói
 * 3. Điền Dân Làng cho đủ số người
 * 4. Kiểm tra tỉ lệ power score, điều chỉnh nếu lệch quá 10%
 */
export function computeBalancedRoles(
  playerCount: number,
  mode: 'classic' | 'extended'
): Record<RoleKey, number> {
  const base: Record<RoleKey, number> = {
    wolf: 0, villager: 0, seer: 0, guard: 0, witch: 0, hunter: 0, cupid: 0,
    elder: 0, jester: 0, alpha_wolf: 0, silencer: 0, detective: 0, avenger_wolf: 0, doppelganger: 0,
  }

  if (mode === 'classic') {
    // Classic: chỉ dùng 7 vai gốc, công thức đơn giản
    const wolves = playerCount <= 6 ? 1 : playerCount <= 9 ? 2 : 3
    base.wolf = wolves
    base.seer = 1
    if (playerCount >= 5) base.guard = 1
    if (playerCount >= 7) base.witch = 1
    if (playerCount >= 8) base.hunter = 1
    if (playerCount >= 9) base.cupid = 1
    // Phần còn lại là dân làng
    const assigned = Object.values(base).reduce((a, b) => a + b, 0)
    base.villager = Math.max(0, playerCount - assigned)
    return base
  }

  // Extended mode — thuật toán balance
  const n = playerCount

  // Bước 1: Phân bổ phe Sói
  // Tỉ lệ sói: ~25% nhưng đảm bảo ít nhất 1 wolf thường
  const totalWolfSlots = Math.max(2, Math.round(n * 0.27))

  if (n >= 12) {
    // Có alpha_wolf hoặc avenger_wolf
    base.alpha_wolf = 1
    base.avenger_wolf = Math.max(0, totalWolfSlots - 2 - 1)
    base.wolf = Math.max(1, totalWolfSlots - base.alpha_wolf - base.avenger_wolf)
  } else if (n >= 10) {
    base.alpha_wolf = 1
    base.wolf = Math.max(1, totalWolfSlots - 1)
  } else {
    base.wolf = totalWolfSlots
  }

  // Bước 2: Phân bổ phe Dân đặc biệt theo số người
  base.seer = 1      // luôn có Tiên Tri
  if (n >= 8)  base.guard = 1
  if (n >= 8)  base.witch = 1
  if (n >= 9)  base.hunter = 1
  if (n >= 10) base.detective = 1
  if (n >= 10) base.silencer = 1
  if (n >= 11) base.elder = 1
  if (n >= 12) base.cupid = 1
  if (n >= 14) base.elder = 2      // thêm elder thứ 2 ở ván lớn

  // Bước 3: Trung lập
  if (n >= 8)  base.jester = 1
  if (n >= 14) base.doppelganger = 1

  // Bước 4: Điền Dân Làng cho đủ số người
  const assigned = Object.values(base).reduce((a, b) => a + b, 0)
  base.villager = Math.max(0, n - assigned)

  // Bước 5: Kiểm tra & điều chỉnh balance
  return rebalance(base, n)
}

function rebalance(roles: Record<RoleKey, number>, playerCount: number): Record<RoleKey, number> {
  const wolfRoles: RoleKey[] = ['wolf', 'alpha_wolf', 'avenger_wolf']
  const villagerSpecialRoles: RoleKey[] = ['seer', 'guard', 'witch', 'hunter', 'detective', 'silencer', 'elder']

  const wolfScore = wolfRoles.reduce((sum, r) => sum + (roles[r] || 0) * ROLE_POWER[r], 0)
  const villagerScore = villagerSpecialRoles.reduce((sum, r) => sum + (roles[r] || 0) * ROLE_POWER[r], 0)
    + (roles.villager || 0) * ROLE_POWER.villager

  const totalScore = wolfScore + villagerScore
  const wolfRatio = wolfScore / totalScore

  // Mục tiêu: wolf_ratio ≈ 0.42-0.48
  if (wolfRatio < 0.40 && roles.avenger_wolf === 0 && playerCount >= 12) {
    // Phe dân quá mạnh → thêm avenger_wolf nếu có thể
    roles.avenger_wolf = 1
    roles.villager = Math.max(0, (roles.villager || 0) - 1)
  } else if (wolfRatio < 0.38) {
    // Thêm 1 sói thường
    roles.wolf = (roles.wolf || 0) + 1
    roles.villager = Math.max(0, (roles.villager || 0) - 1)
  } else if (wolfRatio > 0.52 && (roles.guard || 0) === 0) {
    // Phe sói quá mạnh → thêm bảo vệ
    roles.guard = 1
    roles.villager = Math.max(0, (roles.villager || 0) - 1)
  }

  return roles
}

// Preset cấu hình cho chế độ Mở rộng theo số người (dùng balance engine)
export function getExtendedPreset(playerCount: number): Partial<Record<RoleKey, number>> {
  return computeBalancedRoles(playerCount, 'extended')
}

export const CLASSIC_ROLES: RoleKey[] = ['wolf', 'villager', 'seer', 'guard', 'witch', 'hunter', 'cupid']
export const EXTENDED_ROLES: RoleKey[] = [
  ...CLASSIC_ROLES,
  'elder', 'jester', 'alpha_wolf', 'silencer', 'detective', 'avenger_wolf', 'doppelganger',
]
