// "오늘의 공부 인증" 카드. 화면은 레이어(카드 본체·소인 도장)를 따로 그려 도장이 나중에 찍히게 하고,
// 저장 이미지(인스타그램 스토리 1080×1920)는 같은 함수로 한 장에 합친다. 그래서 미리보기와 저장본이 같다.
// 구성은 사용자가 준 여권 카드 레퍼런스(2026-11-23)를 따른다: 위 종이 띠(물결 줄·제목), 가운데 색 띠(사진·소인·
// 말풍선·아이콘 줄·큰 이름·실루엣), 아래 종이 띠(발행 번호·판독 기호). 레퍼런스 게임 고유의 나뭇잎 무늬·야자수 섬은
// 쓰지 않는다. 톤은 앱 공부 화면 그대로(사용자 결정 2026-11-23 "앱 톤에 맞게"): 섬 팔레트(tokens.css 낮 값),
// 크림 종이에 턱(StudyRoomIslandSurface), 가운데 띠는 통계 화면의 시계 무늬 호수, 둥근 글꼴(TmoneyRoundWind),
// 햇살 노랑 강조, 공부 중 주황 소인. 다크 모드에서 저장해도 같은 이미지가 나오도록 값은 낮 팔레트로 고정한다.
import { paintClockField } from '../../../core/ui/IslandBackground'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { formatStudyDuration } from '../home/studyFormat'
import { flameShape } from '../stats/StreakFlame'
import { goalReached, type StudyRecap } from './studyRecap'

/** 섬 팔레트 낮 값(tokens.css :root·.palette-day). */
const c = {
  paper: '#fffaeb', ledge: '#e7daba', line: '#e9dfc6', muted: '#efe6d0',
  ink: '#5e4a32', inkSoft: '#9a8667',
  lake: '#609baf', lakePattern: '#528ba0',
  sun: '#f8d66a', sunLedge: '#d9b246', onSun: '#5e4a32',
  studying: '#f26a2e', white: '#ffffff',
} as const

const fonts = {
  sans: '"Pretendard Variable", Pretendard, -apple-system, sans-serif',
  round: '"TmoneyRoundWind", "Pretendard Variable", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const

/** 카드(논리 pt, 가로). height는 턱까지 포함한다. */
export const passport = { width: 480, height: 300 } as const
const face = { height: 292, radius: 24, ledge: 8 } as const
const band = { top: 46, bottom: 244 } as const
/** 사진 칸(정사각). 3D 방은 이 비율로 찍는다. */
export const photoSlot = { x: 30, y: 64, width: 122, height: 122 } as const
/** 소인 도장(카드 좌표, 가운데 기준). 사진 왼쪽 아래에 걸쳐 찍힌다. */
export const postmark = { x: 102, y: 206, width: 176, height: 62, rotate: -7 } as const

/** 그리기 전에 글꼴을 읽는다(웹 글꼴은 처음 쓰일 때 내려받아 첫 그림에 빠질 수 있다). */
export async function loadPassportFonts(recap: StudyRecap): Promise<void> {
  const sample = [
    recap.nickname, topSubjectLabel(recap), bragChip(recap) ?? '', quote(recap), fullDate(recap.studyDate),
    webText.recapCardTitle, webText.recapStampGoal, webText.recapStampDone, webText.recapIssue, webText.recapBrand,
    webText.recapStoryHeadlineLead, webText.recapStoryHeadlineTail, webText.recapStoryStreak(recap.streakDays),
    webText.recapStreakRow(recap.streakDays), webText.recapSubjectCount(recap.subjects.length),
    formatStudyDuration(recap.todaySeconds), '0123456789시간분일과목()월화수목금토일%·+!"', t('studySubjectNone'),
  ].join('')
  await Promise.all([
    ...[600, 700, 800].map((w) => document.fonts.load(`${w} 16px ${fonts.sans}`, sample)),
    document.fonts.load(`800 16px ${fonts.round}`, sample),
  ])
}

/** 자랑 한 줄: 목표가 있으면 목표 대비 %, 없으면 어제보다 더 한 만큼. 둘 다 아니면 없음. */
export function bragChip(recap: StudyRecap): string | null {
  if (recap.goalSeconds != null && recap.goalSeconds > 0) {
    return webText.recapGoalChip(formatStudyDuration(recap.goalSeconds), Math.floor((recap.todaySeconds * 100) / recap.goalSeconds))
  }
  const diff = recap.todaySeconds - recap.yesterdaySeconds
  if (diff > 0 && Math.trunc(diff / 60) > 0) return webText.recapMoreChip(formatStudyDuration(diff))
  return null
}

function quote(recap: StudyRecap): string {
  return webText.recapQuote(formatStudyDuration(recap.todaySeconds))
}

function topSubjectLabel(recap: StudyRecap): string {
  const top = recap.subjects[0]
  return top ? top.subject ?? t('studySubjectNone') : t('studySubjectNone')
}

// ── 카드 본체 ──

export function drawPassportBase(ctx: CanvasRenderingContext2D, recap: StudyRecap): void {
  const W = passport.width
  const H = face.height
  // 턱(아래로 8) + 크림 종이 얼굴.
  ctx.fillStyle = c.ledge
  ctx.beginPath(); ctx.roundRect(0, face.ledge, W, H, face.radius); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, face.radius); ctx.clip()
  ctx.fillStyle = c.paper
  ctx.fillRect(0, 0, W, H)
  guilloche(ctx, 0, 8, W, band.top - 14, 4)
  guilloche(ctx, 0, band.bottom + 8, W, H - band.bottom - 16, 4)
  // 가운데 띠: 시계 무늬 호수(통계 화면 바탕과 같다).
  ctx.save()
  ctx.beginPath(); ctx.rect(0, band.top, W, band.bottom - band.top); ctx.clip()
  ctx.translate(0, band.top)
  paintClockField(ctx, W, band.bottom - band.top, c.lake, c.lakePattern, true)
  ctx.restore()
  drawSilhouette(ctx)
  ctx.restore()

  // 제목: 위 띠 가운데 둥근 글꼴, 물결 줄을 끊고 아래에 햇살 밑줄.
  const titleFont = `800 15px ${fonts.round}`
  const tw = measure(ctx, webText.recapCardTitle, titleFont, 1)
  ctx.fillStyle = c.paper
  ctx.fillRect(W / 2 - tw / 2 - 16, 10, tw + 32, 28)
  ctx.fillStyle = c.sun
  ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2 - 4, 26, tw + 8, 7, 3.5); ctx.fill()
  text(ctx, webText.recapCardTitle, W / 2, 30, { font: titleFont, color: c.ink, align: 'center', spacing: 1 })

  drawPhoto(ctx, recap)
  drawBubble(ctx, recap)
  drawRows(ctx, recap)

  // 아래 띠: 발행 번호와 판독 기호(종이를 깔아 물결 줄을 끊는다).
  const by = H - 17
  ctx.fillStyle = c.paper
  ctx.fillRect(16, by - 12, 196, 17); ctx.fillRect(W - 206, by - 12, 190, 17)
  text(ctx, `${webText.recapIssue} ${recap.serial}`, 24, by, { font: `700 10px ${fonts.mono}`, color: c.inkSoft, spacing: 0.3 })
  text(ctx, '<'.repeat(22), W - 24, by, { font: `700 10px ${fonts.mono}`, color: c.inkSoft, align: 'right', spacing: 0.6 })
}

/** 사진: 크림 테두리 둥근 정사각에 턱(3D 방에서 앞에서 찍은 내 자리). */
function drawPhoto(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const { x, y, width: w, height: h } = photoSlot
  ctx.fillStyle = c.ledge
  ctx.beginPath(); ctx.roundRect(x - 6, y - 6 + 4, w + 12, h + 12, 20); ctx.fill()
  ctx.fillStyle = c.paper
  ctx.beginPath(); ctx.roundRect(x - 6, y - 6, w + 12, h + 12, 20); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 15); ctx.clip()
  if (recap.photo) {
    const p = recap.photo
    const s = Math.max(w / p.width, h / p.height)
    ctx.drawImage(p, x + (w - p.width * s) / 2, y + (h - p.height * s) / 2, p.width * s, p.height * s)
  } else {
    ctx.fillStyle = c.muted
    ctx.fillRect(x, y, w, h)
    ctx.save(); ctx.translate(x, y); paintClockField(ctx, w, h, c.muted, c.line, true); ctx.restore()
    clockIcon(ctx, x + w / 2, y + h / 2, 18, c.inkSoft)
  }
  ctx.restore()
}

/** 말풍선: 크림 종이 + 턱, 꼬리는 사진 쪽. 오늘 공부한 시간 자랑. */
function drawBubble(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const x = 174
  const y = 58
  const w = passport.width - 22 - x
  const h = 38
  const tail = (dy: number) => { ctx.beginPath(); ctx.moveTo(x + 8, y + h - 14 + dy); ctx.lineTo(x - 8, y + h + 4 + dy); ctx.lineTo(x + 22, y + h - 1 + dy); ctx.closePath(); ctx.fill() }
  ctx.fillStyle = c.ledge
  ctx.beginPath(); ctx.roundRect(x, y + 3, w, h, 19); ctx.fill(); tail(3)
  ctx.fillStyle = c.paper
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 19); ctx.fill(); tail(0)
  const value = quote(recap)
  let size = 16
  while (size > 11 && measure(ctx, value, `800 ${size}px ${fonts.round}`) > w - 28) size -= 0.5
  text(ctx, value, x + w / 2, y + h / 2 + size * 0.38, { font: `800 ${size}px ${fonts.round}`, color: c.ink, align: 'center' })
}

/** 호수 위 흰 글자: 아이콘 줄(시간·연속·과목 수 / 가장 많이 한 과목·자랑), 큰 이름, 날짜. */
function drawRows(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const x = 176
  const right = passport.width - 22
  const rowFont = `800 13.5px ${fonts.sans}`
  const item = (icon: (cx: number, cy: number) => void, value: string, at: number, baseline: number, maxW: number, font = rowFont) => {
    icon(at + 8, baseline - 5)
    text(ctx, ellipsize(ctx, value, font, maxW - 26), at + 21, baseline, { font, color: c.white, shadow: true })
  }
  const line = (y: number, to = right) => { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x, y, to - x, 1.2) }

  // 1줄: 공부 시간 · 연속 · 과목 수.
  const col = (right - x) / 3
  item((cx, cy) => clockIcon(ctx, cx, cy, 7, c.white), formatStudyDuration(recap.todaySeconds), x, 124, col + 8)
  item((cx, cy) => flame(ctx, cx - 7, cy - 9, 17, recap.streakDays > 0), webText.recapStreakRow(recap.streakDays), x + col + 8, 124, col)
  item((cx, cy) => bookIcon(ctx, cx, cy, c.white), webText.recapSubjectCount(recap.subjects.length), x + col * 2 + 8, 124, col - 8)
  line(135)

  // 2줄: 가장 많이 한 과목 · 자랑. 목표를 채웠으면 자랑은 햇살 알약(앱 강조 칩)으로.
  const brag = bragChip(recap)
  const half = brag ? (right - x) * 0.44 : right - x
  item((cx, cy) => pencilIcon(ctx, cx, cy, c.white), topSubjectLabel(recap), x, 159, half)
  if (brag) {
    const at = x + half
    const font = `800 12px ${fonts.sans}`
    if (goalReached(recap)) {
      const w = Math.min(right - at, measure(ctx, brag, font) + 34)
      ctx.fillStyle = c.sunLedge
      ctx.beginPath(); ctx.roundRect(at, 145 + 3, w, 22, 11); ctx.fill()
      ctx.fillStyle = c.sun
      ctx.beginPath(); ctx.roundRect(at, 145, w, 22, 11); ctx.fill()
      targetIcon(ctx, at + 13, 156, c.onSun)
      text(ctx, ellipsize(ctx, brag, font, w - 32), at + 25, 160.5, { font, color: c.onSun })
    } else {
      item((cx, cy) => targetIcon(ctx, cx, cy, c.white), brag, at, 159, right - at, font)
    }
  }
  line(172, 370)

  // 큰 이름(둥근 글꼴).
  text(ctx, ellipsize(ctx, recap.nickname, `800 26px ${fonts.round}`, 370 - x), x, 205, { font: `800 26px ${fonts.round}`, color: c.white, shadow: true })
  line(214, 370)

  // 날짜.
  item((cx, cy) => calendarIcon(ctx, cx, cy, c.white), fullDate(recap.studyDate), x, 235, 370 - x, `700 12.5px ${fonts.sans}`)
}

/** 오른쪽 아래 공부 실루엣: 언덕 위 책 더미와 스탠드. 크림 종이색. */
function drawSilhouette(ctx: CanvasRenderingContext2D) {
  const fill = 'rgba(255,250,235,0.92)'
  ctx.save()
  ctx.fillStyle = fill; ctx.strokeStyle = fill
  ctx.beginPath(); ctx.ellipse(424, band.bottom + 4, 74, 24, 0, Math.PI, 0); ctx.fill()
  ctx.beginPath(); ctx.roundRect(380, 214, 64, 12, 3); ctx.fill()
  ctx.beginPath(); ctx.roundRect(386, 201, 56, 11, 3); ctx.fill()
  ctx.save(); ctx.translate(414, 193); ctx.rotate(-0.06); ctx.beginPath(); ctx.roundRect(-26, -5, 50, 10, 3); ctx.fill(); ctx.restore()
  ctx.beginPath(); ctx.roundRect(446, 220, 30, 6, 3); ctx.fill()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 4
  ctx.beginPath(); ctx.moveTo(461, 221); ctx.lineTo(467, 184); ctx.lineTo(446, 164); ctx.stroke()
  ctx.save(); ctx.translate(446, 164); ctx.rotate(0.55)
  ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(14, 10); ctx.lineTo(7, -4); ctx.lineTo(-7, -4); ctx.closePath(); ctx.fill()
  ctx.restore()
  ctx.restore()
}

// ── 소인 도장 ──

/** 공부 중 주황 소인: 둥근 네모 안에 "목표 달성"/"기록 완료", 오른쪽으로 물결 소인선. ctx 원점이 도장 가운데. */
export function drawPostmark(ctx: CanvasRenderingContext2D, recap: StudyRecap): void {
  const { width: W, height: H } = postmark
  const m = ctx.getTransform()
  const scale = Math.hypot(m.a, m.b) || 1
  const stamp = document.createElement('canvas')
  stamp.width = Math.ceil(W * scale); stamp.height = Math.ceil(H * scale)
  const s = stamp.getContext('2d')!
  s.setTransform(scale, 0, 0, scale, 0, 0)
  const color = c.studying
  const ox = 50
  const oy = H / 2
  // 사진·호수 위에서도 읽히게 옅은 종이 바탕.
  s.fillStyle = 'rgba(255,250,235,0.82)'
  s.beginPath(); s.roundRect(ox - 44, oy - 19, 88, 38, 10); s.fill()
  s.strokeStyle = color; s.fillStyle = color
  s.lineWidth = 2.6
  s.beginPath(); s.roundRect(ox - 44, oy - 19, 88, 38, 10); s.stroke()
  s.lineWidth = 1
  s.beginPath(); s.roundRect(ox - 39, oy - 14.5, 78, 29, 7); s.stroke()
  const label = goalReached(recap) ? webText.recapStampGoal : webText.recapStampDone
  text(s, label, ox, oy + 5.5, { font: `800 15.5px ${fonts.round}`, color, align: 'center' })
  s.lineWidth = 1.8; s.lineCap = 'round'
  for (let i = 0; i < 4; i++) {
    const y = oy - 13 + i * 8.6
    s.beginPath()
    for (let px = 0; px <= 70; px += 2) {
      const yy = y + Math.sin((px / 70) * Math.PI * 3 + i * 0.6) * 2.4
      if (px === 0) s.moveTo(ox + 50 + px, yy); else s.lineTo(ox + 50 + px, yy)
    }
    s.stroke()
  }
  // 잉크가 덜 묻은 자국.
  s.globalCompositeOperation = 'destination-out'
  const rand = seeded(97)
  for (let i = 0; i < 90; i++) {
    s.globalAlpha = 0.15 + rand() * 0.5
    s.beginPath(); s.arc(rand() * W, rand() * H, 0.3 + rand() * 1, 0, Math.PI * 2); s.fill()
  }
  ctx.save()
  ctx.globalAlpha = 0.95
  ctx.drawImage(stamp, -W / 2, -H / 2, W, H)
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

  // 바탕: 시계 무늬 호수(앱 통계 화면 바탕).
  paintClockField(ctx, W, H, c.lake, c.lakePattern, true)

  // 자랑 문구: "오늘 [6시간 25분] 공부했어요" — 시간은 햇살 알약(턱). 아래에 연속 공부.
  const lead = webText.recapStoryHeadlineLead
  const tail = webText.recapStoryHeadlineTail
  const time = formatStudyDuration(recap.todaySeconds)
  let size = 28
  const f = () => `800 ${size}px ${fonts.round}`
  const pill = () => measure(ctx, time, f()) + 22
  const widthOf = () => measure(ctx, lead, f()) + pill() + measure(ctx, tail, f()) + 16
  while (widthOf() > W - 40 && size > 18) size -= 1
  const hy = 196
  let hx = (W - widthOf()) / 2
  text(ctx, lead, hx, hy, { font: f(), color: c.white, shadow: true })
  hx += measure(ctx, lead, f()) + 8
  const pw = pill()
  const ph = size + 16
  ctx.fillStyle = c.sunLedge
  ctx.beginPath(); ctx.roundRect(hx, hy - size - 2 + 4, pw, ph, ph / 2); ctx.fill()
  ctx.fillStyle = c.sun
  ctx.beginPath(); ctx.roundRect(hx, hy - size - 2, pw, ph, ph / 2); ctx.fill()
  text(ctx, time, hx + 11, hy, { font: f(), color: c.onSun })
  hx += pw + 8
  text(ctx, tail, hx, hy, { font: f(), color: c.white, shadow: true })
  if (recap.streakDays > 0) {
    const sub = webText.recapStoryStreak(recap.streakDays)
    const sf = `800 14px ${fonts.sans}`
    const sw = 20 + 6 + measure(ctx, sub, sf)
    flame(ctx, (W - sw) / 2, hy + 18, 20, true)
    text(ctx, sub, (W - sw) / 2 + 26, hy + 34, { font: sf, color: c.white, shadow: true })
  }

  // 카드: 스토리 폭에 맞춰 줄이고 살짝 기울여 그림자와 함께 놓는다.
  const k = (W - 28) / passport.width
  const cx = W / 2
  const cy = 412
  ctx.save()
  ctx.translate(cx, cy); ctx.scale(k, k); ctx.rotate((-2 * Math.PI) / 180)
  ctx.translate(-passport.width / 2, -passport.height / 2)
  const base = layer(passport.width, passport.height, scale, (cc) => drawPassportBase(cc, recap))
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12
  ctx.drawImage(base, 0, 0, passport.width, passport.height)
  ctx.restore()
  ctx.save(); ctx.translate(postmark.x, postmark.y); ctx.rotate((postmark.rotate * Math.PI) / 180); drawPostmark(ctx, recap); ctx.restore()
  ctx.restore()

  text(ctx, webText.recapBrand, W / 2, H - 96, { font: `800 15px ${fonts.round}`, color: c.white, align: 'center', shadow: true })
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

// ── 장식·아이콘(선 아이콘을 직접 그린다: 이모지·범용 아이콘 대신) ──

/** 여권의 물결 무늬 줄(잉크 갈색, 옅게). */
function guilloche(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lines: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(154,134,103,0.45)'; ctx.lineWidth = 0.8
  for (let i = 0; i < lines; i++) {
    const base = y + (h * (i + 0.5)) / lines
    ctx.beginPath()
    for (let px = x; px <= x + w; px += 3) {
      const yy = base + Math.sin(px / 22 + i * 0.9) * 2 + Math.sin(px / 61 + i) * 1.3
      if (px === x) ctx.moveTo(px, yy); else ctx.lineTo(px, yy)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.6, r * 0.2); ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.55); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.45, y + r * 0.2); ctx.stroke()
  ctx.restore()
}

function bookIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.quadraticCurveTo(x - 4, y - 7, x - 8, y - 6); ctx.lineTo(x - 8, y + 5); ctx.quadraticCurveTo(x - 4, y + 4, x, y + 7)
  ctx.quadraticCurveTo(x + 4, y + 4, x + 8, y + 5); ctx.lineTo(x + 8, y - 6); ctx.quadraticCurveTo(x + 4, y - 7, x, y - 4); ctx.lineTo(x, y + 7); ctx.stroke()
  ctx.restore()
}

function pencilIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.translate(x, y); ctx.rotate(-Math.PI / 4)
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.rect(-7, -2.8, 11, 5.6); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(4, -2.8); ctx.lineTo(8.5, 0); ctx.lineTo(4, 2.8); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-4, -2.8); ctx.lineTo(-4, 2.8); ctx.stroke()
  ctx.restore()
}

function targetIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function calendarIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.roundRect(x - 7, y - 5.5, 14, 12.5, 2.5); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x - 7, y - 1); ctx.lineTo(x + 7, y - 1); ctx.moveTo(x - 3.5, y - 8); ctx.lineTo(x - 3.5, y - 4); ctx.moveTo(x + 3.5, y - 8); ctx.lineTo(x + 3.5, y - 4); ctx.stroke()
  ctx.restore()
}

/** 앱 연속 공부 불꽃(StreakFlame) 모양 그대로. */
function flame(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, lit: boolean) {
  const colors = lit ? flameShape.lit : flameShape.unlit
  ctx.save()
  ctx.translate(x, y)
  ctx.scale((size * 0.88) / 44, size / 50)
  ctx.fillStyle = colors.body; ctx.fill(new Path2D(flameShape.body))
  ctx.lineCap = 'round'
  ctx.strokeStyle = colors.shine; ctx.lineWidth = 3.4; ctx.stroke(new Path2D(flameShape.shine))
  ctx.fillStyle = colors.face; ctx.beginPath(); ctx.arc(22, 35, 9, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = colors.hand; ctx.lineWidth = 2.2; ctx.stroke(new Path2D(flameShape.hand))
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

/** shadow: 호수 위 흰 글자에 앱 제목처럼 옅은 그늘. */
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, o: { font: string; color: string; align?: CanvasTextAlign; spacing?: number; shadow?: boolean }) {
  ctx.save()
  ctx.font = o.font
  ctx.fillStyle = o.color
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  if (o.spacing) ctx.letterSpacing = `${o.spacing}px`
  if (o.shadow) { ctx.shadowColor = 'rgba(40,70,82,0.45)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1 }
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

// ── 문구 ──

function parseDate(studyDate: string): [number, number, number] {
  return studyDate.split('-').map(Number) as [number, number, number]
}

function fullDate(studyDate: string): string {
  const [y, m, d] = parseDate(studyDate)
  return webText.recapDateRow(y, m, d)
}
