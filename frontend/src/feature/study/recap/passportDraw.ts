// "오늘의 공부 인증" 카드. 화면은 레이어(카드 본체·소인 도장)를 따로 그려 도장이 나중에 찍히게 하고,
// 저장 이미지(인스타그램 스토리 1080×1920)는 같은 함수로 한 장에 합친다. 그래서 미리보기와 저장본이 같다.
// 구성은 사용자가 준 여권 카드 레퍼런스(2026-11-23)를 따른다: 위 크림 띠(물결 줄·제목), 가운데 색 띠(사진·소인·
// 말풍선·아이콘 줄·큰 이름·실루엣), 아래 크림 띠(발행 번호·판독 기호). 레퍼런스 게임 고유의 나뭇잎 무늬·야자수 섬은
// 쓰지 않고 섬 언어(작은 시계 무늬)와 공부 실루엣(스탠드·책)으로 바꿨다. 팔레트는 사용자가 정한 문구용품 색.
import { paintClockField } from '../../../core/ui/IslandBackground'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { formatStudyDuration } from '../home/studyFormat'
import { flameShape } from '../stats/StreakFlame'
import { goalReached, type StudyRecap } from './studyRecap'

export const ink = {
  ivory: '#FFF8ED', peach: '#F6B5A9', butter: '#F8DFA7', coral: '#E98D86', sage: '#A8BDA4', ink: '#302D35',
  /** 작은 글자용: 코랄은 아이보리 위 대비가 낮아 글자에는 진한 코랄을 쓴다. */
  coralText: '#B4504A',
  inkSoft: '#77717B', white: '#FFFFFF',
  /** 가운데 띠: 코랄 바탕과 한 단계 밝은 무늬, 띠 위 선. */
  band: '#E98D86', bandPattern: '#EFA49D', bandLine: 'rgba(255,248,237,0.55)',
  /** 물결 줄·소인 잉크(남색 잉크). */
  guilloche: 'rgba(59,63,107,0.55)', stampInk: '#3B3F6B',
} as const

export const fonts = {
  sans: '"Pretendard Variable", Pretendard, -apple-system, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  round: '"TmoneyRoundWind", "Pretendard Variable", sans-serif',
} as const

/** 카드(논리 pt, 가로). */
export const passport = { width: 480, height: 300, radius: 18 } as const
const band = { top: 46, bottom: 250 } as const
/** 사진 칸(정사각). 3D 방은 이 비율로 찍는다. */
export const photoSlot = { x: 30, y: 66, width: 124, height: 124 } as const
/** 소인 도장(카드 좌표, 가운데 기준). 사진 왼쪽 아래에 걸쳐 찍힌다. */
export const postmark = { x: 104, y: 214, width: 176, height: 62, rotate: -7 } as const

const weekdays = ['월', '화', '수', '목', '금', '토', '일']

/** 그리기 전에 글꼴을 읽는다(웹 글꼴은 처음 쓰일 때 내려받아 첫 그림에 빠질 수 있다). */
export async function loadPassportFonts(recap: StudyRecap): Promise<void> {
  const sample = [
    recap.nickname, topSubjectLabel(recap), bragChip(recap) ?? '', quote(recap), fullDate(recap.studyDate),
    webText.recapCardTitle, webText.recapStampGoal, webText.recapStampDone, webText.recapIssue,
    webText.recapStoryHeadlineLead, webText.recapStoryHeadlineTail, webText.recapStoryStreak(recap.streakDays),
    webText.recapStreakRow(recap.streakDays), webText.recapSubjectCount(recap.subjects.length),
    formatStudyDuration(recap.todaySeconds), '0123456789시간분일과목()월화수목금토일%·+!', t('studySubjectNone'),
  ].join('')
  await Promise.all([600, 700, 800, 900].map((w) => document.fonts.load(`${w} 16px ${fonts.sans}`, sample)).concat(document.fonts.load(`800 16px ${fonts.round}`, webText.recapBrand)))
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
  const { width: W, height: H, radius } = passport
  ctx.save()
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, radius); ctx.clip()

  // 위·아래 크림 띠와 물결 줄.
  ctx.fillStyle = ink.ivory
  ctx.fillRect(0, 0, W, H)
  grain(ctx, W, H, 11, 1600)
  guilloche(ctx, 0, 8, W, band.top - 12, 5)
  guilloche(ctx, 0, band.bottom + 8, W, H - band.bottom - 16, 5)

  // 가운데 색 띠: 코랄 + 옅은 시계 무늬.
  ctx.save()
  ctx.beginPath(); ctx.rect(0, band.top, W, band.bottom - band.top); ctx.clip()
  ctx.translate(0, band.top)
  paintClockField(ctx, W, band.bottom - band.top, ink.band, ink.bandPattern, true)
  ctx.restore()
  ctx.fillStyle = 'rgba(48,45,53,0.12)'
  ctx.fillRect(0, band.top, W, 1); ctx.fillRect(0, band.bottom - 1, W, 1)

  drawSilhouette(ctx)
  ctx.restore()

  // 제목: 위 띠 가운데, 물결 줄을 끊고 들어간다.
  const titleFont = `800 15px ${fonts.sans}`
  const tw = measure(ctx, webText.recapCardTitle, titleFont, 1.2)
  ctx.fillStyle = ink.ivory
  ctx.fillRect(W / 2 - tw / 2 - 14, 12, tw + 28, 24)
  text(ctx, webText.recapCardTitle, W / 2, 30, { font: titleFont, color: ink.stampInk, align: 'center', spacing: 1.2 })
  ctx.fillStyle = ink.stampInk
  ctx.fillRect(W / 2 - tw / 2 - 2, 34, tw + 4, 1.5)

  drawPhoto(ctx, recap)
  drawBubble(ctx, recap)
  drawRows(ctx, recap)

  // 아래 띠: 발행 번호와 판독 기호.
  ctx.fillStyle = ink.ivory
  ctx.fillRect(18, H - 30, 200, 18); ctx.fillRect(W - 210, H - 30, 192, 18)
  text(ctx, `${webText.recapIssue} ${recap.serial}`, 26, H - 17, { font: `700 10px ${fonts.mono}`, color: ink.ink, spacing: 0.3 })
  text(ctx, '<'.repeat(22), W - 26, H - 17, { font: `700 10px ${fonts.mono}`, color: ink.stampInk, align: 'right', spacing: 0.6, alpha: 0.75 })
}

/** 사진: 흰 테두리 둥근 정사각(3D 방에서 앞에서 찍은 내 자리). */
function drawPhoto(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const { x, y, width: w, height: h } = photoSlot
  ctx.save()
  ctx.shadowColor = 'rgba(48,45,53,0.25)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3
  ctx.fillStyle = ink.white
  ctx.beginPath(); ctx.roundRect(x - 6, y - 6, w + 12, h + 12, 20); ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 15); ctx.clip()
  if (recap.photo) {
    const p = recap.photo
    const s = Math.max(w / p.width, h / p.height)
    ctx.drawImage(p, x + (w - p.width * s) / 2, y + (h - p.height * s) / 2, p.width * s, p.height * s)
  } else {
    ctx.fillStyle = ink.butter
    ctx.fillRect(x, y, w, h)
    ctx.save(); ctx.globalAlpha = 0.5; ctx.translate(x, y); paintClockField(ctx, w, h, ink.butter, '#EBCB8A', true); ctx.restore()
    clockIcon(ctx, x + w / 2, y + h / 2, 18, ink.ink)
  }
  ctx.restore()
}

/** 말풍선: 오늘 공부한 시간 자랑. 꼬리가 사진 쪽을 가리킨다. */
function drawBubble(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const x = 176
  const y = 60
  const w = passport.width - 22 - x
  const h = 38
  ctx.save()
  ctx.shadowColor = 'rgba(48,45,53,0.18)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2
  ctx.fillStyle = ink.ivory
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill()
  ctx.beginPath(); ctx.moveTo(x + 6, y + h - 12); ctx.lineTo(x - 9, y + h + 4); ctx.lineTo(x + 20, y + h - 1); ctx.closePath(); ctx.fill()
  ctx.restore()
  const value = quote(recap)
  let size = 16
  while (size > 11 && measure(ctx, value, `800 ${size}px ${fonts.sans}`, -0.3) > w - 24) size -= 0.5
  text(ctx, value, x + w / 2, y + h / 2 + size * 0.36, { font: `800 ${size}px ${fonts.sans}`, color: ink.ink, align: 'center', spacing: -0.3 })
}

/** 아이콘 줄(시간·연속·과목 수 / 가장 많이 한 과목·자랑), 큰 이름, 날짜. 줄 사이는 크림 선. */
function drawRows(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const x = 178
  const right = passport.width - 22
  const rowFont = `800 13.5px ${fonts.sans}`
  const item = (icon: (cx: number, cy: number) => void, value: string, at: number, baseline: number, maxW: number, font = rowFont) => {
    icon(at + 8, baseline - 5)
    text(ctx, ellipsize(ctx, value, font, maxW - 26), at + 21, baseline, { font, color: ink.ink })
  }
  const line = (y: number, to = right) => { ctx.fillStyle = ink.bandLine; ctx.fillRect(x, y, to - x, 1.2) }

  // 1줄: 공부 시간 · 연속 · 과목 수.
  const col = (right - x) / 3
  item((cx, cy) => clockIcon(ctx, cx, cy, 7, ink.ink), formatStudyDuration(recap.todaySeconds), x, 125, col + 6)
  item((cx, cy) => flame(ctx, cx - 7, cy - 8, 16, recap.streakDays > 0), webText.recapStreakRow(recap.streakDays), x + col + 6, 125, col)
  item((cx, cy) => bookIcon(ctx, cx, cy, ink.ink), webText.recapSubjectCount(recap.subjects.length), x + col * 2 + 6, 125, col - 6)
  line(136)

  // 2줄: 가장 많이 한 과목 · 자랑(목표 %·어제보다).
  const brag = bragChip(recap)
  const half = brag ? (right - x) * 0.46 : right - x
  item((cx, cy) => pencilIcon(ctx, cx, cy, ink.ink), topSubjectLabel(recap), x, 160, half)
  if (brag) item((cx, cy) => targetIcon(ctx, cx, cy, ink.ink), brag, x + half, 160, right - x - half, `800 12.5px ${fonts.sans}`)
  line(171, 372)

  // 큰 이름.
  text(ctx, ellipsize(ctx, recap.nickname, `800 26px ${fonts.sans}`, 372 - x), x, 206, { font: `800 26px ${fonts.sans}`, color: ink.ink, spacing: -0.6 })
  line(216, 372)

  // 날짜.
  item((cx, cy) => calendarIcon(ctx, cx, cy, ink.ink), fullDate(recap.studyDate), x, 239, 372 - x, `700 12.5px ${fonts.sans}`)
}

/** 오른쪽 아래 공부 실루엣: 둥근 언덕 위 책 더미와 스탠드. 크림색으로 띠 위에 얹는다. */
function drawSilhouette(ctx: CanvasRenderingContext2D) {
  const c = 'rgba(255,248,237,0.9)'
  ctx.save()
  ctx.fillStyle = c; ctx.strokeStyle = c
  // 언덕.
  ctx.beginPath(); ctx.ellipse(424, band.bottom + 4, 74, 24, 0, Math.PI, 0); ctx.fill()
  // 책 세 권.
  ctx.beginPath(); ctx.roundRect(380, 220, 64, 12, 3); ctx.fill()
  ctx.beginPath(); ctx.roundRect(386, 207, 56, 11, 3); ctx.fill()
  ctx.save(); ctx.translate(414, 199); ctx.rotate(-0.06); ctx.beginPath(); ctx.roundRect(-26, -5, 50, 10, 3); ctx.fill(); ctx.restore()
  // 스탠드: 받침·기둥·팔·갓.
  ctx.beginPath(); ctx.roundRect(446, 226, 30, 6, 3); ctx.fill()
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 4
  ctx.beginPath(); ctx.moveTo(461, 227); ctx.lineTo(467, 190); ctx.lineTo(446, 170); ctx.stroke()
  ctx.save(); ctx.translate(446, 170); ctx.rotate(0.55)
  ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(14, 10); ctx.lineTo(7, -4); ctx.lineTo(-7, -4); ctx.closePath(); ctx.fill()
  ctx.restore()
  ctx.restore()
}

// ── 소인 도장 ──

/** 우체국 소인: 둥근 네모 안에 "기록 완료"/"목표 달성", 오른쪽으로 물결 소인선. ctx 원점이 도장 가운데. */
export function drawPostmark(ctx: CanvasRenderingContext2D, recap: StudyRecap): void {
  const { width: W, height: H } = postmark
  const m = ctx.getTransform()
  const scale = Math.hypot(m.a, m.b) || 1
  const stamp = document.createElement('canvas')
  stamp.width = Math.ceil(W * scale); stamp.height = Math.ceil(H * scale)
  const s = stamp.getContext('2d')!
  s.setTransform(scale, 0, 0, scale, 0, 0)
  const color = ink.stampInk
  s.strokeStyle = color; s.fillStyle = color
  const ox = 50
  const oy = H / 2
  s.lineWidth = 2.6
  s.beginPath(); s.roundRect(ox - 44, oy - 19, 88, 38, 10); s.stroke()
  s.lineWidth = 1
  s.beginPath(); s.roundRect(ox - 39, oy - 14.5, 78, 29, 7); s.stroke()
  const label = goalReached(recap) ? webText.recapStampGoal : webText.recapStampDone
  text(s, label, ox, oy + 5.5, { font: `900 16px ${fonts.sans}`, color, align: 'center', spacing: -0.2 })
  // 물결 소인선 네 줄.
  s.lineWidth = 1.6; s.lineCap = 'round'
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
  for (let i = 0; i < 120; i++) {
    s.globalAlpha = 0.15 + rand() * 0.6
    s.beginPath(); s.arc(rand() * W, rand() * H, 0.3 + rand() * 1.1, 0, Math.PI * 2); s.fill()
  }
  s.globalAlpha = 0.25
  s.beginPath(); s.ellipse(W * 0.9, H * 0.85, 40, 22, 0, 0, Math.PI * 2); s.fill()
  ctx.save()
  ctx.globalAlpha = 0.9
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

  // 바탕: 버터 크림 종이와 점 격자.
  ctx.fillStyle = '#FBEACB'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(48,45,53,0.09)'
  for (let y = 14; y < H; y += 18) for (let x = 14; x < W; x += 18) { ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill() }
  grain(ctx, W, H, 3, 2600)

  // 자랑 문구: "오늘 [6시간 25분] 공부했어요" — 시간만 코랄 형광펜. 아래에 연속 공부(없으면 공부일).
  text(ctx, `${webText.recapBrand.toUpperCase()}  ·  ${stampDate(recap.studyDate)}`, W / 2, 150, { font: `600 7.5px ${fonts.mono}`, color: ink.inkSoft, align: 'center', spacing: 1.2 })
  const lead = webText.recapStoryHeadlineLead
  const tail = webText.recapStoryHeadlineTail
  const time = formatStudyDuration(recap.todaySeconds)
  let size = 30
  const f = () => `800 ${size}px ${fonts.sans}`
  const widthOf = () => measure(ctx, lead, f(), -0.6) + measure(ctx, time, f(), -0.6) + measure(ctx, tail, f(), -0.6) + 16
  while (widthOf() > W - 48 && size > 20) size -= 1
  let hx = (W - widthOf()) / 2
  const hy = 200
  text(ctx, lead, hx, hy, { font: f(), color: ink.ink, spacing: -0.6 })
  hx += measure(ctx, lead, f(), -0.6) + 8
  const tw = measure(ctx, time, f(), -0.6)
  ctx.save(); ctx.fillStyle = 'rgba(233,141,134,0.38)'
  ctx.beginPath(); ctx.moveTo(hx - 4, hy - size * 0.3); ctx.lineTo(hx + tw + 4, hy - size * 0.36); ctx.lineTo(hx + tw + 3, hy + 5); ctx.lineTo(hx - 3, hy + 6); ctx.closePath(); ctx.fill(); ctx.restore()
  text(ctx, time, hx, hy, { font: f(), color: ink.ink, spacing: -0.6 })
  hx += tw + 8
  text(ctx, tail, hx, hy, { font: f(), color: ink.ink, spacing: -0.6 })
  const sub = recap.streakDays > 0 ? webText.recapStoryStreak(recap.streakDays) : fullDate(recap.studyDate)
  text(ctx, sub, W / 2, hy + 30, { font: `700 13.5px ${fonts.sans}`, color: ink.coralText, align: 'center' })

  // 카드 묶음: 뒤 피치 종이 + 카드 + 소인. 가로 카드는 스토리 폭에 맞춰 줄인다.
  const k = (W - 28) / passport.width
  const cx = W / 2
  const cy = 418
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
  ctx.save(); ctx.translate(postmark.x, postmark.y); ctx.rotate((postmark.rotate * Math.PI) / 180); drawPostmark(ctx, recap); ctx.restore()
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

// ── 장식·아이콘(선 아이콘을 직접 그린다: 이모지·범용 아이콘 대신) ──

/** 지폐·여권의 물결 무늬 줄. */
function guilloche(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lines: number) {
  ctx.save()
  ctx.strokeStyle = ink.guilloche; ctx.lineWidth = 0.7
  for (let i = 0; i < lines; i++) {
    const base = y + (h * (i + 0.5)) / lines
    ctx.beginPath()
    for (let px = x; px <= x + w; px += 3) {
      const yy = base + Math.sin(px / 22 + i * 0.9) * 2.2 + Math.sin(px / 61 + i) * 1.4
      if (px === x) ctx.moveTo(px, yy); else ctx.lineTo(px, yy)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, r * 0.2); ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.55); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.45, y + r * 0.2); ctx.stroke()
  ctx.restore()
}

function bookIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.quadraticCurveTo(x - 4, y - 7, x - 8, y - 6); ctx.lineTo(x - 8, y + 5); ctx.quadraticCurveTo(x - 4, y + 4, x, y + 7)
  ctx.quadraticCurveTo(x + 4, y + 4, x + 8, y + 5); ctx.lineTo(x + 8, y - 6); ctx.quadraticCurveTo(x + 4, y - 7, x, y - 4); ctx.lineTo(x, y + 7); ctx.stroke()
  ctx.restore()
}

function pencilIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.translate(x, y); ctx.rotate(-Math.PI / 4)
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.rect(-7, -2.8, 11, 5.6); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(4, -2.8); ctx.lineTo(8.5, 0); ctx.lineTo(4, 2.8); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-4, -2.8); ctx.lineTo(-4, 2.8); ctx.stroke()
  ctx.restore()
}

function targetIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(x, y, 3.8, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function calendarIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round'
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

// ── 문구 ──

function parseDate(studyDate: string): [number, number, number] {
  return studyDate.split('-').map(Number) as [number, number, number]
}

function fullDate(studyDate: string): string {
  const [y, m, d] = parseDate(studyDate)
  return webText.recapDateRow(y, m, d, weekdays[(new Date(y, m - 1, d).getDay() + 6) % 7]!)
}

export function stampDate(studyDate: string): string {
  const [y, m, d] = parseDate(studyDate)
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`
}
