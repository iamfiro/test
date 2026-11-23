// "오늘의 공부" 카드: 스토리에 올려 오늘 공부한 결과를 자랑하는 세로 카드 한 장. 비주얼 중심(사용자 결정 2026-11-23):
// 트레이딩 카드처럼 무지개 포일 테두리 안을 3D 방에서 찍은 내 자리 사진이 꽉 채우고, 그 위에 종이 명판을 얹는다.
//   위 명판: 오늘 공부한 시간(가장 크게) + 목표/어제 대비 알약
//   아래 칸 두 개: 연속 공부(불꽃 + n일), 이 방 오늘 순위(트로피 + n등, 햇살 칸 — 서버 값이 있을 때만)
// 그리는 순서는 세 겹이다: 본체(테두리·사진·필름 날짜) → 홀로그램 포일 → 명판(포일 위라 글자가 또렷하다).
// 화면은 본체·명판을 캔버스 레이어로, 포일은 움직이는 CSS 레이어로 겹치고, 저장 이미지(인스타그램 스토리 1080×1920)는
// 같은 함수로 시계 무늬 호수 위에 합친다(포일은 한 순간으로 굽는다).
// 톤은 앱 공부 화면: 섬 팔레트 낮 값(tokens.css), 크림 종이와 턱, 둥근 글꼴, 햇살 노랑 강조, 앱 트로피 스티커 아트.
// 다크 모드에서 저장해도 같은 이미지가 나오도록 값은 낮 팔레트로 고정한다.
import { paintClockField } from '../../../core/ui/IslandBackground'
import { webText } from '../../../l10n/web_ko'
import { formatStudyDuration } from '../home/studyFormat'
import { flameShape } from '../stats/StreakFlame'
import { goalReached, type StudyRecap } from './studyRecap'

/** 섬 팔레트 낮 값(tokens.css :root·.palette-day). */
const c = {
  paper: '#fffaeb', ledge: '#e7daba', line: '#e9dfc6', muted: '#efe6d0', mutedLedge: '#d9cba8',
  ink: '#5e4a32', inkSoft: '#9a8667',
  lake: '#609baf', lakePattern: '#528ba0',
  sun: '#f8d66a', sunLedge: '#d9b246', onSun: '#5e4a32',
  white: '#ffffff',
} as const

const fonts = {
  sans: '"Pretendard Variable", Pretendard, -apple-system, sans-serif',
  round: '"TmoneyRoundWind", "Pretendard Variable", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const

/** 카드(트레이딩 카드 2:3). 아래 10은 종이 턱. */
const face = { width: 368, height: 552, radius: 28, ledge: 10, frame: 12 } as const
/** 사진 칸 = 테두리 안 전부. 3D 방은 이 비율로 찍는다. */
export const photoSize = { width: face.width - face.frame * 2, height: face.height - face.frame * 2 } as const
const plate = { inset: 14, radius: 22, ledge: 4 } as const
const tile = { height: 92, gap: 10 } as const
/** 순위 칸 트로피: 앱 스티커 아트(원본 PocketTime assets/icons/study_trophy.png, 공부 화면 트로피 단추). */
const trophyUrl = '/assets/icons/study_trophy.png'

export type CardAssets = { trophy: HTMLImageElement }

type Rect = { x: number; y: number; width: number; height: number }
export type CardLayout = {
  width: number
  height: number
  photo: Rect & { radius: number }
  top: Rect
  pill: Rect | null
  tiles: Rect
  date: { x: number; y: number }
}

export function cardLayout(recap: StudyRecap): CardLayout {
  const art = { x: face.frame, y: face.frame, width: photoSize.width, height: photoSize.height, radius: 18 }
  const inner = { x: art.x + plate.inset, width: art.width - plate.inset * 2 }
  const top = { x: inner.x, y: art.y + plate.inset, width: inner.width, height: 106 }
  const pill = sideLabel(recap) ? { x: 0, y: top.y + top.height - 4, width: 0, height: 30 } : null
  const tiles = { x: inner.x, y: art.y + art.height - plate.inset - plate.ledge - tile.height, width: inner.width, height: tile.height }
  return {
    width: face.width,
    height: face.height + face.ledge,
    photo: art,
    top,
    pill,
    tiles,
    date: { x: art.x + art.width - 16, y: tiles.y - 14 },
  }
}

/** 글꼴과 트로피 그림을 미리 읽는다(웹 글꼴은 처음 쓰일 때 내려받아 첫 그림에 빠질 수 있다). */
export async function loadCardAssets(recap: StudyRecap): Promise<CardAssets> {
  const sample = [
    webText.recapTimeLabel, webText.recapStreakLabel, webText.recapStreakUnit, webText.recapRankLabel, webText.recapRankUnit,
    recap.rank ? webText.recapRankTotal(recap.rank.total) : '', sideLabel(recap) ?? '',
    formatStudyDuration(recap.todaySeconds), webText.recapBrand, '0123456789.·+/시간분일등명',
  ].join('')
  const trophy = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`trophy load failed: ${trophyUrl}`))
    img.src = trophyUrl
  })
  const [img] = await Promise.all([
    trophy,
    document.fonts.load(`800 16px ${fonts.round}`, sample),
    ...[600, 700, 800].map((w) => document.fonts.load(`${w} 16px ${fonts.sans}`, sample)),
  ])
  return { trophy: img }
}

/** 시간 아래 알약: 목표를 채웠으면 "목표 달성", 못 채웠으면 "목표의 n%", 목표가 없고 어제보다 더 했으면 "어제보다 +n". */
function sideLabel(recap: StudyRecap): string | null {
  if (goalReached(recap)) return webText.recapGoalReached
  if (recap.goalSeconds != null && recap.goalSeconds > 0) {
    return webText.recapGoalPercent(Math.floor((recap.todaySeconds * 100) / recap.goalSeconds))
  }
  const diff = recap.todaySeconds - recap.yesterdaySeconds
  if (diff > 0 && Math.trunc(diff / 60) > 0) return webText.recapMoreChip(formatStudyDuration(diff))
  return null
}

// ── 1겹: 본체(테두리·사진·필름 날짜) ──

export function drawCardBase(ctx: CanvasRenderingContext2D, recap: StudyRecap): void {
  const L = cardLayout(recap)
  const W = face.width
  const H = face.height
  // 종이 턱 + 크림 테두리(포일이 이 위에 무지개를 입힌다).
  ctx.fillStyle = c.ledge
  ctx.beginPath(); ctx.roundRect(0, face.ledge, W, H, face.radius); ctx.fill()
  ctx.fillStyle = c.paper
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, face.radius); ctx.fill()

  // 사진: 테두리 안을 꽉 채운다. 사진이 없으면 시계 무늬 호수.
  const { x, y, width: w, height: h, radius } = L.photo
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.clip()
  if (recap.photo) {
    const img = recap.photo
    const s = Math.max(w / img.width, h / img.height)
    ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s)
  } else {
    ctx.save(); ctx.translate(x, y); paintClockField(ctx, w, h, c.lake, c.lakePattern, true); ctx.restore()
  }
  ctx.restore()
  // 사진 가장자리 안쪽 얇은 선(인쇄된 창 느낌).
  ctx.save()
  ctx.strokeStyle = 'rgba(94,74,50,0.25)'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.roundRect(x + 0.6, y + 0.6, w - 1.2, h - 1.2, radius); ctx.stroke()
  ctx.restore()

  // 필름 날짜(사진 오른쪽, 아래 칸 위).
  const [yy, mm, dd] = recap.studyDate.split('-')
  const stamp = `'${yy!.slice(2)} ${mm} ${dd}`
  ctx.save()
  ctx.font = `800 18px ${fonts.mono}`
  ctx.letterSpacing = '2px'
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(40,20,10,0.45)'
  ctx.fillText(stamp, L.date.x + 1, L.date.y + 1.5)
  ctx.shadowColor = 'rgba(255,120,40,0.9)'; ctx.shadowBlur = 8
  ctx.fillStyle = '#ff9a4a'
  ctx.fillText(stamp, L.date.x, L.date.y)
  ctx.restore()
}

// ── 3겹: 명판(포일 위) ──

export function drawPlates(ctx: CanvasRenderingContext2D, recap: StudyRecap, assets: CardAssets): void {
  const L = cardLayout(recap)
  const panel = (r: Rect, color: string, ledge: string, radius: number = plate.radius) => {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4
    ctx.fillStyle = ledge
    ctx.beginPath(); ctx.roundRect(r.x, r.y + plate.ledge, r.width, r.height, radius); ctx.fill()
    ctx.restore()
    ctx.fillStyle = color
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.width, r.height, radius); ctx.fill()
  }

  // 위 명판: 오늘 공부한 시간.
  panel(L.top, c.paper, c.ledge)
  const mid = L.top.x + L.top.width / 2
  text(ctx, webText.recapTimeLabel, mid, L.top.y + 28, { font: `800 14px ${fonts.sans}`, color: c.inkSoft, align: 'center' })
  drawDuration(ctx, recap.todaySeconds, mid, L.top.y + 88, L.top.width - 28)

  // 명판 아래에 걸친 알약.
  const side = sideLabel(recap)
  if (side && L.pill) {
    const reached = goalReached(recap)
    const font = `800 14px ${fonts.sans}`
    const w = measure(ctx, side, font) + 32
    const x = mid - w / 2
    const y = L.pill.y
    ctx.fillStyle = reached ? c.sunLedge : c.mutedLedge
    ctx.beginPath(); ctx.roundRect(x, y + 3, w, L.pill.height, L.pill.height / 2); ctx.fill()
    ctx.fillStyle = reached ? c.sun : c.muted
    ctx.beginPath(); ctx.roundRect(x, y, w, L.pill.height, L.pill.height / 2); ctx.fill()
    text(ctx, side, mid, y + 20, { font, color: reached ? c.onSun : c.ink, align: 'center' })
  }

  // 아래 칸: 연속 공부 · 방 순위. 순위가 없으면 연속 칸이 꽉 찬다.
  const w = recap.rank ? (L.tiles.width - tile.gap) / 2 : L.tiles.width
  const lit = recap.streakDays > 0
  const streak = { x: L.tiles.x, y: L.tiles.y, width: w, height: tile.height }
  panel(streak, c.paper, c.ledge, 20)
  stat(ctx, streak, webText.recapStreakLabel, (ix, iy) => flame(ctx, ix + 2, iy - 2, 36, lit), String(recap.streakDays), webText.recapStreakUnit, lit ? c.ink : c.inkSoft, c.inkSoft)
  if (recap.rank) {
    const rank = { x: L.tiles.x + w + tile.gap, y: L.tiles.y, width: w, height: tile.height }
    panel(rank, c.sun, c.sunLedge, 20)
    stat(ctx, rank, webText.recapRankLabel, (ix, iy) => { ctx.drawImage(assets.trophy, ix - 2, iy - 4, 38, 38) },
      String(recap.rank.position), webText.recapRankUnit, c.onSun, 'rgba(94,74,50,0.72)', webText.recapRankTotal(recap.rank.total))
  }
}

/** 칸 안: 라벨(위 가운데) + 아이콘 + 큰 숫자 + 단위(+ 꼬리). */
function stat(ctx: CanvasRenderingContext2D, r: Rect, label: string, icon: (ix: number, iy: number) => void, num: string, unit: string, ink: string, soft: string, tail?: string) {
  text(ctx, label, r.x + r.width / 2, r.y + 26, { font: `800 13px ${fonts.sans}`, color: soft, align: 'center' })
  const numFont = `800 40px ${fonts.round}`
  const unitFont = `800 17px ${fonts.round}`
  const tailFont = `800 12.5px ${fonts.sans}`
  const iconW = 34
  const tailW = tail ? 5 + measure(ctx, tail, tailFont) : 0
  const total = iconW + 6 + measure(ctx, num, numFont) + 3 + measure(ctx, unit, unitFont) + tailW
  let cx = r.x + (r.width - total) / 2
  const base = r.y + 74
  icon(cx, base - 32)
  cx += iconW + 6
  text(ctx, num, cx, base, { font: numFont, color: ink })
  cx += measure(ctx, num, numFont) + 3
  text(ctx, unit, cx, base, { font: unitFont, color: soft })
  if (tail) text(ctx, tail, cx + measure(ctx, unit, unitFont) + 5, base, { font: tailFont, color: soft })
}

/** "6시간 25분": 숫자는 크게, 단위는 작게, 숫자 아래 절반에 햇살 형광펜. */
function drawDuration(ctx: CanvasRenderingContext2D, seconds: number, mid: number, baseline: number, maxWidth: number) {
  const parts = formatStudyDuration(seconds).match(/\d+|\D+/g) ?? []
  let big = 64
  const layout = () => parts.map((p) => {
    const digit = /\d/.test(p)
    const value = digit ? p : p.trim()
    const font = digit ? `800 ${big}px ${fonts.round}` : `800 ${Math.round(big * 0.38)}px ${fonts.round}`
    return { value, digit, font, width: measure(ctx, value, font) }
  })
  let items = layout()
  const gap = (i: number) => (i === 0 ? 0 : items[i]!.digit ? 12 : 4)
  const total = () => items.reduce((sum, it, i) => sum + it.width + gap(i), 0)
  while (total() > maxWidth && big > 36) { big -= 2; items = layout() }
  let x = mid - total() / 2
  items.forEach((it, i) => {
    x += gap(i)
    if (it.digit) {
      ctx.fillStyle = c.sun
      ctx.beginPath(); ctx.roundRect(x - 4, baseline - big * 0.34, it.width + 8, big * 0.38, big * 0.12); ctx.fill()
      text(ctx, it.value, x, baseline, { font: it.font, color: c.ink })
    } else {
      text(ctx, it.value, x, baseline, { font: it.font, color: c.inkSoft })
    }
    x += it.width
  })
}

// ── 2겹: 홀로그램 포일(저장 이미지용) ──

/**
 * 화면의 CSS 포일(recap.module.css .foil)을 한 순간(빛이 왼쪽 위)으로 굳혀 입힌다:
 * 테두리에 진한 곱하기 무지개 + 반짝이, 사진에는 옅은 무지개 → 사진 칸에만 닷지 빛 띠·반짝이·에칭 줄·빛 반사.
 */
export function drawFoil(ctx: CanvasRenderingContext2D, recap: StudyRecap): void {
  const L = cardLayout(recap)
  const W = face.width
  const H = face.height
  ctx.save()
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, face.radius); ctx.clip()
  const angle = ((115 - 90) * Math.PI) / 180
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const along = (cx: number, cy: number, span: number) =>
    ctx.createLinearGradient(cx - dx * span / 2, cy - dy * span / 2, cx + dx * span / 2, cy + dy * span / 2)

  const hues = [[0, 78], [40, 75], [70, 72], [150, 75], [195, 75], [250, 80], [310, 80], [360, 78]] as const
  const rainbow = along(W / 2, H / 2, W * Math.abs(dx) + H * Math.abs(dy))
  for (let k = 0; k < 2; k++) hues.forEach(([h, l], i) => rainbow.addColorStop(Math.min(1, (k * 7 + i) / 15), `hsl(${h} 95% ${l}%)`))
  const { x: px, y: py, width: pw, height: ph, radius } = L.photo
  // 테두리(사진 칸을 뺀 고리)에는 진하게, 사진 위에는 옅게.
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = rainbow
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.roundRect(px, py, pw, ph, radius); ctx.clip('evenodd')
  ctx.globalAlpha = 0.7
  ctx.fillRect(0, 0, W, H)
  ctx.restore()
  ctx.globalAlpha = 0.22
  ctx.fillRect(px, py, pw, ph)

  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 1
  let a = 1234567
  const rand = () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296 }
  const specks = (x0: number, y0: number, w: number, h: number, count: number, alpha: number) => {
    for (let i = 0; i < count; i++) {
      const r = rand() < 0.9 ? 0.25 + rand() * 0.3 : 0.5 + rand() * 0.6
      ctx.fillStyle = `hsla(${Math.floor(rand() * 360)}, 100%, ${85 + rand() * 15}%, ${(0.35 + rand() * 0.65) * alpha})`
      ctx.beginPath(); ctx.arc(x0 + rand() * w, y0 + rand() * h, r, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.roundRect(px, py, pw, ph, radius); ctx.clip('evenodd')
  specks(0, 0, W, H, 1400, 0.6)
  ctx.restore()

  ctx.save()
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, radius); ctx.clip()
  const band = along(px + pw / 2, py + ph / 2, pw * Math.abs(dx) + ph * Math.abs(dy))
  band.addColorStop(0, 'rgba(255,255,255,0)')
  band.addColorStop(0.2, 'rgba(255,255,255,0)')
  band.addColorStop(0.3, 'hsla(50,100%,80%,0.75)')
  band.addColorStop(0.35, 'hsla(180,100%,82%,0.8)')
  band.addColorStop(0.4, 'hsla(290,100%,86%,0.75)')
  band.addColorStop(0.5, 'rgba(255,255,255,0)')
  band.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalCompositeOperation = 'color-dodge'
  ctx.globalAlpha = 0.4
  ctx.fillStyle = band
  ctx.fillRect(px, py, pw, ph)
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 1
  specks(px, py, pw, ph, 1200, 0.5)
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5
  const run = ph / Math.tan((62 * Math.PI) / 180)
  for (let x = px - run; x < px + pw; x += 4 / Math.sin((62 * Math.PI) / 180)) {
    ctx.beginPath(); ctx.moveTo(x, py + ph); ctx.lineTo(x + run, py); ctx.stroke()
  }
  const gx = px + pw * 0.3
  const gy = py + ph * 0.3
  const glare = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.hypot(pw, ph) * 0.62)
  glare.addColorStop(0, 'rgba(255,255,255,0.7)')
  glare.addColorStop(0.5, 'rgba(255,255,255,0.15)')
  glare.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalCompositeOperation = 'soft-light'
  ctx.fillStyle = glare
  ctx.fillRect(px, py, pw, ph)
  ctx.restore()
  ctx.restore()
}

// ── 저장 이미지(스토리) ──

export const story = { width: 432, height: 768, scale: 2.5 } as const

export function drawStory(canvas: HTMLCanvasElement, recap: StudyRecap, assets: CardAssets): void {
  const { width: W, height: H, scale } = story
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.imageSmoothingQuality = 'high'

  // 바탕: 시계 무늬 호수(앱 통계 화면 바탕).
  paintClockField(ctx, W, H, c.lake, c.lakePattern, true)

  // 카드: 아래 날짜·이름 자리를 남기고 가운데, 살짝 기울여 그림자와 함께.
  const L = cardLayout(recap)
  const k = Math.min(1, (H - 170) / L.height)
  const cx = W / 2
  const cy = (H - 70) / 2 + 10
  ctx.save()
  ctx.translate(cx, cy); ctx.scale(k, k); ctx.rotate((-1.5 * Math.PI) / 180); ctx.translate(-L.width / 2, -L.height / 2)
  const layerCanvas = layer(L.width, L.height, scale, (cc) => { drawCardBase(cc, recap); drawFoil(cc, recap); drawPlates(cc, recap, assets) })
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.26)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 14
  ctx.drawImage(layerCanvas, 0, 0, L.width, L.height)
  ctx.restore()
  ctx.restore()

  // 아래: 날짜 · 서비스 이름.
  const [y, m, d] = recap.studyDate.split('-')
  text(ctx, `${y}.${m}.${d}`, W / 2, H - 52, { font: `700 12px ${fonts.mono}`, color: c.white, align: 'center', shadow: true })
  text(ctx, webText.recapBrand, W / 2, H - 30, { font: `800 15px ${fonts.round}`, color: c.white, align: 'center', shadow: true })
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

// ── 도우미 ──

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

/** shadow: 호수 위 흰 글자에 앱 제목처럼 옅은 그늘. */
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, o: { font: string; color: string; align?: CanvasTextAlign; shadow?: boolean }) {
  ctx.save()
  ctx.font = o.font
  ctx.fillStyle = o.color
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  if (o.shadow) { ctx.shadowColor = 'rgba(40,70,82,0.45)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1 }
  ctx.fillText(value, x, y)
  ctx.restore()
}

function measure(ctx: CanvasRenderingContext2D, value: string, font: string): number {
  ctx.save(); ctx.font = font
  const w = ctx.measureText(value).width
  ctx.restore()
  return w
}
