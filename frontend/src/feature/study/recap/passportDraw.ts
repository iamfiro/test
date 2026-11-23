// "오늘의 공부 여권" 아트. 화면은 레이어(여권 본체·과목 우표·완료 도장)를 따로 그려 하나씩 움직이고,
// 저장 이미지(인스타그램 스토리 1080×1920, 점 격자 종이 위 여권 한 장)는 같은 함수로 합친다.
// 앱에 없는 화면이라 사용자가 정한 문구용품 팔레트(아이보리·피치·버터·코랄·세이지·잉크, 2026-11-23)를 쓰고,
// 섬 언어(작은 시계 무늬, 3D 방 사진)만 이어 받는다. 그라데이션 광원·이모지·범용 아이콘은 쓰지 않는다.
import { paintClockField } from '../../../core/ui/IslandBackground'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { formatStudyDuration } from '../home/studyFormat'
import { goalReached, passportStampSlots, type StudyRecap } from './studyRecap'

export const ink = {
  ivory: '#FFF8ED', peach: '#F6B5A9', butter: '#F8DFA7', coral: '#E98D86', sage: '#A8BDA4', ink: '#302D35',
  /** 작은 글자용: 코랄은 아이보리 위 대비가 낮아 글자에는 진한 코랄을 쓴다. */
  coralText: '#B4504A',
  inkSoft: '#77717B', line: '#E7DCC8', edge: '#E6D8C0', paperShade: '#F7EEDC', white: '#FFFFFF',
} as const

export const fonts = {
  sans: '"Pretendard Variable", Pretendard, -apple-system, sans-serif',
  serif: 'ui-serif, "New York", "Iowan Old Style", Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  round: '"TmoneyRoundWind", "Pretendard Variable", sans-serif',
} as const

/** 여권 본체(논리 pt, 가로). 왼쪽 면은 사진·정보, 세로 절취선 오른쪽 면(비자 칸)은 과목 우표·도장. */
export const passport = { width: 480, height: 300, radius: 18 } as const
const stubX = 318
/** 사진 칸. 3D 방은 이 비율로 찍는다. */
export const photoSlot = { x: 28, y: 104, width: 94, height: 118 } as const
/** 과목 우표 크기와 붙는 자리(여권 좌표, 가운데 기준). */
export const subjectStamp = { width: 68, height: 82, margin: 6 } as const
export const subjectSlots = [
  { x: 362, y: 140, rotate: -5 },
  { x: 434, y: 146, rotate: 4 },
] as const satisfies readonly { x: number; y: number; rotate: number }[]
/** 완료 도장(여권 좌표, 가운데 기준). */
export const completionStamp = { x: 410, y: 232, radius: 48, rotate: -12, margin: 6 } as const

const weekdays = ['월', '화', '수', '목', '금', '토', '일']

/** 그리기 전에 글꼴을 읽는다(웹 글꼴은 처음 쓰일 때 내려받아 첫 그림에 빠질 수 있다). */
export async function loadPassportFonts(recap: StudyRecap): Promise<void> {
  const sample = [
    recap.nickname, ...recap.subjects.map((s) => s.subject ?? t('studySubjectNone')),
    webText.recapPassportTitle(12, 31), webText.recapStampGoal, webText.recapStampDone, webText.recapFieldName, webText.recapFieldDate,
    webText.recapFieldFocus, webText.recapFieldStreak, webText.recapFieldSubjects,
    formatStudyDuration(recap.todaySeconds), '0123456789시간분일과목()월화수목금토일', t('studySubjectNone'),
  ].join('')
  await Promise.all([600, 700, 800].map((w) => document.fonts.load(`${w} 16px ${fonts.sans}`, sample)).concat(document.fonts.load(`800 16px ${fonts.round}`, webText.recapBrand)))
}

// ── 여권 본체 ──

export function drawPassportBase(ctx: CanvasRenderingContext2D, recap: StudyRecap): void {
  const { width: W, height: H, radius } = passport
  ctx.save()
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, radius); ctx.clip()
  ctx.fillStyle = ink.ivory
  ctx.fillRect(0, 0, W, H)
  ctx.save(); ctx.globalAlpha = 0.32; paintClockField(ctx, W, H, ink.ivory, '#F1DCCB', true); ctx.restore()
  grain(ctx, W, H, 11, 1800)
  // 오른쪽 면(비자 칸)은 아주 옅은 버터색 종이.
  ctx.fillStyle = 'rgba(248,223,167,0.28)'
  ctx.fillRect(stubX, 0, W - stubX, H)
  ctx.restore()

  // 겹 테두리.
  hairRect(ctx, 9, 9, W - 18, H - 18, 12, 'rgba(233,141,134,0.42)', 1)
  hairRect(ctx, 12.5, 12.5, W - 25, H - 25, 9.5, 'rgba(233,141,134,0.2)', 0.75)

  // 머리: 미세 글자, 번호, 제목.
  text(ctx, webText.recapPassportBrand, 28, 34, { font: `600 6.8px ${fonts.mono}`, color: ink.inkSoft, spacing: 1.4 })
  const serialRight = stubX - 18
  text(ctx, 'No.', serialRight - measure(ctx, recap.serial, `700 9.5px ${fonts.mono}`, 0.6) - 4, 34, { font: `500 6.8px ${fonts.mono}`, color: ink.inkSoft, align: 'right' })
  text(ctx, recap.serial, serialRight, 34, { font: `700 9.5px ${fonts.mono}`, color: ink.coralText, align: 'right', spacing: 0.6 })
  const [, month, day] = parseDate(recap.studyDate)
  text(ctx, webText.recapPassportTitle(month, day), 28, 64, { font: `800 20px ${fonts.sans}`, color: ink.ink, spacing: -0.4 })
  text(ctx, webText.recapPassportKind, 28, 81, { font: `italic 500 11px ${fonts.serif}`, color: ink.inkSoft })
  embossSeal(ctx, stubX - 40, 66, 16)
  ctx.fillStyle = ink.line
  ctx.fillRect(28, 92, stubX - 46, 1)

  drawPhotoSlot(ctx, recap)
  drawFields(ctx, recap)

  // 세로 절취선과 위아래 펀치 홈.
  ctx.save()
  ctx.strokeStyle = 'rgba(48,45,53,0.28)'; ctx.lineWidth = 1; ctx.setLineDash([2.5, 3.5])
  ctx.beginPath(); ctx.moveTo(stubX, 20); ctx.lineTo(stubX, H - 20); ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  for (const y of [0, H]) { ctx.beginPath(); ctx.arc(stubX, y, 10, 0, Math.PI * 2); ctx.fill() }
  ctx.restore()

  // 비자 칸 머리.
  text(ctx, 'VISA', stubX + 20, 34, { font: `700 6.8px ${fonts.mono}`, color: ink.inkSoft, spacing: 1.6 })
  text(ctx, stampDate(recap.studyDate), W - 26, 34, { font: `600 6.8px ${fonts.mono}`, color: ink.inkSoft, align: 'right', spacing: 0.8 })
  label(ctx, webText.recapFieldSubjects, 'Subjects', stubX + 20, 64)
  ctx.fillStyle = ink.line
  ctx.fillRect(stubX + 20, 92, W - stubX - 46, 1)
  // 비어 있는 우표 자리(점선 틀). 우표가 붙으면 그 아래에 가려진다.
  for (let i = 0; i < passportStampSlots; i++) {
    const slot = subjectSlots[i]!
    ctx.save()
    ctx.translate(slot.x, slot.y)
    ctx.strokeStyle = 'rgba(48,45,53,0.16)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.roundRect(-subjectStamp.width / 2 + 2, -subjectStamp.height / 2 + 2, subjectStamp.width - 4, subjectStamp.height - 4, 4); ctx.stroke()
    ctx.restore()
  }

  drawMachineLines(ctx, recap)
}

function drawPhotoSlot(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const { x, y, width: w, height: h } = photoSlot
  // 오려 붙일 자리 점선(여권 사진 칸).
  ctx.save()
  ctx.strokeStyle = 'rgba(48,45,53,0.32)'; ctx.lineWidth = 1; ctx.setLineDash([3, 2.5])
  ctx.beginPath(); ctx.roundRect(x - 8, y - 8, w + 16, h + 16, 8); ctx.stroke()
  ctx.restore()
  // 흰 인화지.
  ctx.save()
  ctx.shadowColor = 'rgba(48,45,53,0.18)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2
  ctx.fillStyle = ink.white
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6)
  ctx.restore()
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  if (recap.photo) {
    const p = recap.photo
    const s = Math.max(w / p.width, h / p.height)
    ctx.drawImage(p, x + (w - p.width * s) / 2, y + (h - p.height * s) / 2, p.width * s, p.height * s)
  } else {
    ctx.fillStyle = ink.butter
    ctx.fillRect(x, y, w, h)
    ctx.save(); ctx.globalAlpha = 0.5; ctx.translate(x, y); paintClockField(ctx, w, h, ink.butter, '#EBCB8A', true); ctx.restore()
    clockGlyph(ctx, x + w / 2, y + h / 2, 16, ink.ink, 2.2)
  }
  ctx.restore()
  paperclip(ctx, x + 14, y - 12, -8)
}

function drawFields(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const x = 144
  const w = stubX - 22 - x
  const rows: [string, string, string][] = [
    [webText.recapFieldName, 'Name', recap.nickname],
    [webText.recapFieldDate, 'Date', dateLabel(recap.studyDate)],
    [webText.recapFieldFocus, 'Focus', formatStudyDuration(recap.todaySeconds)],
    [webText.recapFieldStreak, 'Streak', t('studyStatsStreakValue', { count: recap.streakDays })],
  ]
  rows.forEach(([ko, en, value], i) => {
    const top = 100 + i * 32
    label(ctx, ko, en, x, top + 9)
    const font = `700 12.5px ${fonts.sans}`
    text(ctx, ellipsize(ctx, value, font, w), x, top + 25, { font, color: ink.ink })
    ctx.save()
    ctx.strokeStyle = 'rgba(48,45,53,0.22)'; ctx.lineWidth = 0.8; ctx.setLineDash([1, 2.2])
    ctx.beginPath(); ctx.moveTo(x, top + 29.5); ctx.lineTo(x + w, top + 29.5); ctx.stroke()
    ctx.restore()
  })
}

/** 여권 아래 기계 판독 줄(실제 값으로 만든다: 공부일·집중 시간·연속·번호). */
function drawMachineLines(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const font = `500 7.4px ${fonts.mono}`
  const width = stubX - 46
  const charW = measure(ctx, '<', font, 1.1) || 5
  const n = Math.max(10, Math.floor(width / charW))
  const minutes = Math.floor(recap.todaySeconds / 60)
  const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}`
  const pad = (s: string) => (s.length >= n ? s.slice(0, n) : s + '<'.repeat(n - s.length))
  const line1 = pad(`P<SV<${recap.studyDate.replace(/-/g, '')}<<FOCUS${hhmm}<<STREAK${String(recap.streakDays).padStart(3, '0')}`)
  const line2 = pad(`${recap.serial.replace(/-/g, '')}<<${String(Math.floor(recap.sessionSeconds / 60)).padStart(4, '0')}`)
  text(ctx, line1, 28, passport.height - 30, { font, color: 'rgba(48,45,53,0.5)', spacing: 1.1 })
  text(ctx, line2, 28, passport.height - 19, { font, color: 'rgba(48,45,53,0.5)', spacing: 1.1 })
}

// ── 과목 우표 ──

/** 우표 한 장. ctx 원점이 우표 가운데. */
export function drawSubjectStamp(ctx: CanvasRenderingContext2D, item: { subject: string | null; seconds: number }, index: number): void {
  const { width: w, height: h } = subjectStamp
  const tint = [ink.peach, ink.butter, ink.sage][index % 3]!
  ctx.save()
  ctx.shadowColor = 'rgba(48,45,53,0.22)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2
  // 톱니 가장자리: 흰 종이에 구멍을 뚫는다(같은 캔버스의 다른 그림을 지우지 않게 따로 그려 붙인다).
  const scale = ctx.getTransform().a
  const paper = document.createElement('canvas')
  paper.width = Math.ceil((w + 2) * scale); paper.height = Math.ceil((h + 2) * scale)
  const p = paper.getContext('2d')!
  p.setTransform(scale, 0, 0, scale, 0, 0)
  p.translate(1, 1)
  p.fillStyle = ink.white
  p.fillRect(0, 0, w, h)
  p.globalCompositeOperation = 'destination-out'
  const r = 2.4
  for (let x = 4; x < w; x += 7) { hole(p, x, 0, r); hole(p, x, h, r) }
  for (let y = 4; y < h; y += 7) { hole(p, 0, y, r); hole(p, w, y, r) }
  ctx.drawImage(paper, -w / 2 - 1, -h / 2 - 1, w + 2, h + 2)
  ctx.restore()

  ctx.save()
  ctx.translate(-w / 2, -h / 2)
  ctx.fillStyle = tint
  ctx.fillRect(6, 6, w - 12, h - 12)
  ctx.save(); ctx.globalAlpha = 0.18; ctx.translate(6, 6); grain(ctx, w - 12, h - 12, 31 + index, 160); ctx.restore()
  ctx.strokeStyle = 'rgba(48,45,53,0.35)'; ctx.lineWidth = 0.6
  ctx.strokeRect(8.5, 8.5, w - 17, h - 17)
  text(ctx, `SV·${String(index + 1).padStart(2, '0')}`, 12, 18, { font: `700 5.8px ${fonts.mono}`, color: 'rgba(48,45,53,0.7)', spacing: 0.6 })
  clockGlyph(ctx, w - 16, 15.5, 3.6, 'rgba(48,45,53,0.7)', 0.9)
  // 단어가 중간에서 끊기지 않게, 가장 긴 단어가 한 줄에 들어갈 때까지 글자를 줄인 뒤 단어 단위로 나눈다.
  const name = item.subject ?? t('studySubjectNone')
  const maxW = w - 22
  let size = 10
  const longest = () => Math.max(...name.split(' ').map((word) => measure(ctx, word, `800 ${size}px ${fonts.sans}`)))
  while (size > 7.5 && longest() > maxW) size -= 0.5
  const nameFont = `800 ${size}px ${fonts.sans}`
  const lines = wrap(ctx, name, nameFont, maxW, 3)
  const lh = size * 1.22
  lines.forEach((line, i) => text(ctx, line, w / 2, 42 + i * lh - ((lines.length - 1) * lh) / 2, { font: nameFont, color: ink.ink, align: 'center' }))
  ctx.fillStyle = 'rgba(48,45,53,0.35)'
  ctx.fillRect(14, h - 26, w - 28, 0.6)
  text(ctx, formatStudyDuration(item.seconds), w / 2, h - 14.5, { font: `700 8.5px ${fonts.sans}`, color: ink.ink, align: 'center' })
  ctx.restore()
}

// ── 완료 도장 ──

/** 둥근 잉크 도장. ctx 원점이 도장 가운데. */
export function drawCompletionStamp(ctx: CanvasRenderingContext2D, recap: StudyRecap): void {
  const r = completionStamp.radius
  const scale = ctx.getTransform().a
  const size = r * 2 + 4
  const stamp = document.createElement('canvas')
  stamp.width = Math.ceil(size * scale); stamp.height = Math.ceil(size * scale)
  const s = stamp.getContext('2d')!
  s.setTransform(scale, 0, 0, scale, 0, 0)
  s.translate(size / 2, size / 2)
  // 코랄보다 한 단계 진한 잉크(작은 글자까지 읽히게).
  const color = '#D8665E'
  s.strokeStyle = color; s.fillStyle = color
  s.lineWidth = 2.6
  s.beginPath(); s.arc(0, 0, r - 1.5, 0, Math.PI * 2); s.stroke()
  s.lineWidth = 1
  s.beginPath(); s.arc(0, 0, r - 6, 0, Math.PI * 2); s.stroke()
  s.beginPath(); s.arc(0, 0, r - 21, 0, Math.PI * 2); s.stroke()
  arcText(s, webText.recapStampTop, r - 13.5, -Math.PI / 2, `800 8.6px ${fonts.mono}`, color, 2.2, false)
  arcText(s, webText.recapStampBottom, r - 13.5, Math.PI / 2, `800 8.6px ${fonts.mono}`, color, 2.2, true)
  for (const a of [Math.PI, 0]) { s.save(); s.translate(Math.cos(a) * (r - 13.5), Math.sin(a) * (r - 13.5)); star(s, 3.2); s.restore() }
  const center = goalReached(recap) ? webText.recapStampGoal : webText.recapStampDone
  text(s, center, 0, 2, { font: `800 12.5px ${fonts.sans}`, color, align: 'center', spacing: -0.2 })
  text(s, stampDate(recap.studyDate), 0, 14, { font: `700 6.8px ${fonts.mono}`, color, align: 'center', spacing: 0.4 })
  // 잉크가 덜 묻은 자국.
  s.globalCompositeOperation = 'destination-out'
  const rand = seeded(97)
  for (let i = 0; i < 110; i++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * r
    s.globalAlpha = 0.15 + rand() * 0.55
    s.beginPath(); s.arc(Math.cos(a) * d, Math.sin(a) * d, 0.3 + rand() * 1.1, 0, Math.PI * 2); s.fill()
  }
  // 한쪽이 더 눌린 자국.
  s.globalAlpha = 0.22
  s.beginPath(); s.arc(r * 0.95, r * 0.8, r * 0.62, 0, Math.PI * 2); s.fill()
  ctx.save()
  ctx.globalAlpha = 0.97
  ctx.drawImage(stamp, -size / 2, -size / 2, size, size)
  ctx.restore()
}

// ── 저장 이미지(스토리) ──

export const story = { width: 432, height: 768, scale: 2.5 } as const

export function drawStory(canvas: HTMLCanvasElement, recap: StudyRecap): void {
  const { width: W, height: H, scale } = story
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.imageSmoothingQuality = 'high'

  // 바탕: 버터 크림 종이와 점 격자.
  ctx.fillStyle = '#FBEACB'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(48,45,53,0.09)'
  for (let y = 14; y < H; y += 18) for (let x = 14; x < W; x += 18) { ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill() }
  grain(ctx, W, H, 3, 2600)

  // 여권 묶음: 뒤 피치 종이 + 여권 + 우표 + 도장.
  // 가로 여권은 스토리 폭에 맞춰 줄인다.
  const k = (W - 40) / passport.width
  const cx = W / 2
  const cy = H / 2 - 10
  ctx.save()
  ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy)
  ctx.save()
  ctx.translate(cx + 10, cy + 12); ctx.rotate((3.5 * Math.PI) / 180)
  ctx.shadowColor = 'rgba(48,45,53,0.16)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8
  ctx.fillStyle = ink.peach
  ctx.beginPath(); ctx.roundRect(-passport.width / 2, -passport.height / 2, passport.width, passport.height, passport.radius); ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((-2 * Math.PI) / 180)
  ctx.translate(-passport.width / 2, -passport.height / 2)
  const base = layer(passport.width, passport.height, scale, (c) => drawPassportBase(c, recap))
  ctx.save()
  ctx.shadowColor = 'rgba(48,45,53,0.24)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 12
  ctx.drawImage(base, 0, 0, passport.width, passport.height)
  ctx.restore()
  recap.subjects.slice(0, passportStampSlots).forEach((item, i) => {
    const slot = subjectSlots[i]!
    ctx.save(); ctx.translate(slot.x, slot.y); ctx.rotate((slot.rotate * Math.PI) / 180); drawSubjectStamp(ctx, item, i); ctx.restore()
  })
  ctx.save(); ctx.translate(completionStamp.x, completionStamp.y); ctx.rotate((completionStamp.rotate * Math.PI) / 180); drawCompletionStamp(ctx, recap); ctx.restore()
  ctx.restore()
  ctx.restore()

  text(ctx, webText.recapBrand, W / 2, H - 92, { font: `800 13px ${fonts.round}`, color: ink.ink, align: 'center', alpha: 0.72 })
}

/** 논리 크기 w×h를 scale배 캔버스에 그린다. */
export function layer(w: number, h: number, scale: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * scale)
  canvas.height = Math.ceil(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.imageSmoothingQuality = 'high'
  draw(ctx)
  return canvas
}

// ── 장식 도우미 ──

function label(ctx: CanvasRenderingContext2D, ko: string, en: string, x: number, y: number) {
  const koFont = `700 8.2px ${fonts.sans}`
  text(ctx, ko, x, y, { font: koFont, color: ink.inkSoft })
  text(ctx, en, x + measure(ctx, ko, koFont) + 4, y, { font: `italic 500 8px ${fonts.serif}`, color: 'rgba(119,113,123,0.8)' })
}

function hairRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string, width: number) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke(); ctx.restore()
}

/** 종이에 눌러 찍은 문장(紋章): 그림자 쪽과 빛 쪽을 반 점씩 어긋나게 그려 도드라져 보이게. */
function embossSeal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const pass = (dx: number, dy: number, color: string) => {
    ctx.save()
    ctx.translate(x + dx, y + dy)
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      ctx.beginPath(); ctx.arc(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3), 0.6, 0, Math.PI * 2); ctx.fill()
    }
    ctx.beginPath(); ctx.arc(0, 0, r - 6, 0, Math.PI * 2); ctx.stroke()
    clockGlyph(ctx, 0, 0, 5.5, color, 1.1)
    ctx.restore()
  }
  pass(0.7, 0.7, 'rgba(48,45,53,0.16)')
  pass(-0.6, -0.6, 'rgba(255,255,255,0.95)')
  pass(0, 0, 'rgba(230,216,192,0.7)')
}

function paperclip(ctx: CanvasRenderingContext2D, x: number, y: number, deg: number) {
  ctx.save()
  ctx.translate(x, y); ctx.rotate((deg * Math.PI) / 180)
  const path = new Path2D('M3 30 V7 a4.5 4.5 0 0 1 9 0 V34 a6 6 0 0 1 -12 0 V11 a3 3 0 0 1 6 0 V29')
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(48,45,53,0.25)'; ctx.lineWidth = 2.4
  ctx.save(); ctx.translate(0.8, 1.2); ctx.stroke(path); ctx.restore()
  ctx.strokeStyle = '#8FA39B'; ctx.lineWidth = 2
  ctx.stroke(path)
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.7
  ctx.save(); ctx.translate(-0.4, -0.4); ctx.stroke(path); ctx.restore()
  ctx.restore()
}

function clockGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width: number) {
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.6); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.45, y + r * 0.2); ctx.stroke()
  ctx.restore()
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    const d = i % 2 ? r * 0.4 : r
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d)
  }
  ctx.closePath(); ctx.fill()
}

function hole(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}

/** 원을 따라 글자를 놓는다. bottom이면 아래 호를 왼쪽에서 오른쪽으로 읽히게. */
function arcText(ctx: CanvasRenderingContext2D, value: string, radius: number, center: number, font: string, color: string, spacing: number, bottom: boolean) {
  ctx.save()
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const widths = [...value].map((ch) => ctx.measureText(ch).width + spacing)
  const total = widths.reduce((a, b) => a + b, 0) - spacing
  let angle = center + (bottom ? 1 : -1) * (total / 2 / radius)
  ;[...value].forEach((ch, i) => {
    const step = widths[i]! / radius
    const a = angle + (bottom ? -1 : 1) * (step - spacing / radius) / 2
    ctx.save()
    ctx.translate(Math.cos(a) * radius, Math.sin(a) * radius)
    ctx.rotate(a + (bottom ? -Math.PI / 2 : Math.PI / 2))
    ctx.fillText(ch, 0, 0)
    ctx.restore()
    angle += (bottom ? -1 : 1) * step
  })
  ctx.restore()
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, count: number) {
  const rand = seeded(seed)
  ctx.save()
  ctx.fillStyle = ink.ink
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.018 + rand() * 0.03
    ctx.fillRect(rand() * w, rand() * h, 0.55, 0.55)
  }
  ctx.restore()
}

/** 늘 같은 꾸밈을 위한 작은 난수(mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let r = Math.imul(a ^ (a >>> 15), 1 | a)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// ── 글자 도우미 ──

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, o: { font: string; color: string; align?: CanvasTextAlign; spacing?: number; alpha?: number }) {
  ctx.save()
  ctx.font = o.font
  ctx.fillStyle = o.color
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  if (o.alpha != null) ctx.globalAlpha *= o.alpha
  if (o.spacing) ctx.letterSpacing = `${o.spacing}px`
  ctx.fillText(value, x, y)
  ctx.restore()
}

function measure(ctx: CanvasRenderingContext2D, value: string, font: string, spacing = 0): number {
  ctx.save(); ctx.font = font
  if (spacing) ctx.letterSpacing = `${spacing}px`
  const w = ctx.measureText(value).width
  ctx.restore()
  return w
}

function ellipsize(ctx: CanvasRenderingContext2D, value: string, font: string, max: number): string {
  if (measure(ctx, value, font) <= max) return value
  let out = value
  while (out.length > 1 && measure(ctx, `${out}…`, font) > max) out = out.slice(0, -1)
  return `${out}…`
}

/** 글자 단위로 줄을 나눈다(한글은 띄어쓰기 없이도 나뉜다). 넘치면 마지막 줄 끝을 줄임표로. */
function wrap(ctx: CanvasRenderingContext2D, value: string, font: string, max: number, maxLines: number): string[] {
  const words = value.split(' ')
  const lines: string[] = []
  let line = ''
  const push = (piece: string) => {
    const next = line ? `${line} ${piece}` : piece
    if (measure(ctx, next, font) <= max) { line = next; return }
    if (line) lines.push(line)
    line = piece
    while (measure(ctx, line, font) > max && line.length > 1) {
      let cut = line.length
      while (cut > 1 && measure(ctx, line.slice(0, cut), font) > max) cut--
      lines.push(line.slice(0, cut))
      line = line.slice(cut)
    }
  }
  words.forEach(push)
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = ellipsize(ctx, `${kept[maxLines - 1]}${lines.slice(maxLines).join('')}`, font, max)
  return kept
}

// ── 문구 ──

function parseDate(studyDate: string): [number, number, number] {
  return studyDate.split('-').map(Number) as [number, number, number]
}

export function dateLabel(studyDate: string): string {
  const [y, m, d] = parseDate(studyDate)
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${weekdays[(new Date(y, m - 1, d).getDay() + 6) % 7]})`
}

export function stampDate(studyDate: string): string {
  const [y, m, d] = parseDate(studyDate)
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`
}
