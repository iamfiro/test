// "오늘의 공부" 카드: 스토리에 올려 오늘 공부한 시간을 자랑하는 세로 카드 한 장.
// 화면은 같은 그리기 함수로 카드를 그리고 그 위에 움직이는 포일을 겹치며, 저장 이미지(인스타그램 스토리 1080×1920)는
// 같은 함수로 시계 무늬 호수 위에 합친다. 그래서 미리보기와 저장본이 같다.
// 위에서부터: 오늘 공부한 시간(가장 크게) → 목표/어제 대비 알약 → 연속 공부·방 순위 칸(크게) → 3D 방 사진.
// 톤은 앱 공부 화면(사용자 결정 2026-11-23): 섬 팔레트 낮 값(tokens.css), 크림 종이와 턱, 둥근 글꼴, 햇살 노랑 강조,
// 순위 칸에 앱 트로피 스티커 아트. 그 위에 레인보우 홀로그램 포일(사용자 레퍼런스: 레인보우 레어 카드)을 입힌다.
// 다크 모드에서 저장해도 같은 이미지가 나오도록 값은 낮 팔레트로 고정한다.
import { paintClockField } from '../../../core/ui/IslandBackground'
import { webText } from '../../../l10n/web_ko'
import { formatStudyDuration } from '../home/studyFormat'
import { flameShape } from '../stats/StreakFlame'
import { goalReached, type StudyRecap } from './studyRecap'

/** 섬 팔레트 낮 값(tokens.css :root·.palette-day). */
const c = {
  paper: '#fffaeb', ledge: '#e7daba', line: '#e9dfc6', muted: '#efe6d0', mutedLedge: '#e0d3b3',
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

/** 위 16은 테이프가 삐져나오는 자리, 아래 10은 종이 턱. */
const tapeTop = 16
const face = { width: 368, radius: 28, ledge: 10, inset: 14 } as const
/** 사진 칸 크기. 3D 방은 이 비율로 찍는다. */
export const photoSize = { width: face.width - face.inset * 2, height: 270 } as const
const tile = { height: 92, gap: 12, radius: 20, ledge: 4 } as const
/** 순위 칸 트로피: 앱 스티커 아트(원본 PocketTime assets/icons/study_trophy.png, 공부 화면 트로피 단추). */
const trophyUrl = '/assets/icons/study_trophy.png'

export type CardAssets = { trophy: HTMLImageElement }

/** 카드 레이어 안 자리(논리 pt). 목표/어제 알약이 있으면 그만큼 길어진다. */
export type CardLayout = {
  width: number
  height: number
  faceHeight: number
  timeLabel: number
  timeBase: number
  side: { y: number } | null
  tiles: { y: number }
  photo: { x: number; y: number; width: number; height: number }
}

export function cardLayout(recap: StudyRecap): CardLayout {
  let y = 22
  const timeLabel = y + 16
  const timeBase = timeLabel + 70
  y = timeBase + 16
  const side = sideLabel(recap) ? { y } : null
  if (side) y += 28 + 16
  const tiles = { y }
  y += tile.height + tile.ledge + 14
  const photo = { x: face.inset, y: tapeTop + y, width: photoSize.width, height: photoSize.height }
  y += photoSize.height + face.inset
  return {
    width: face.width,
    height: tapeTop + y + face.ledge,
    faceHeight: y,
    timeLabel: tapeTop + timeLabel,
    timeBase: tapeTop + timeBase,
    side: side ? { y: tapeTop + side.y } : null,
    tiles: { y: tapeTop + tiles.y },
    photo,
  }
}

/** 글꼴과 스티커 그림을 미리 읽는다(웹 글꼴은 처음 쓰일 때 내려받아 첫 그림에 빠질 수 있다). */
export async function loadCardAssets(recap: StudyRecap): Promise<CardAssets> {
  const sample = [
    webText.recapTimeLabel, webText.recapStreakLabel, webText.recapStreakUnit, webText.recapRankLabel, webText.recapRankUnit,
    recap.rank ? webText.recapRankTotal(recap.rank.total) : '', sideLabel(recap) ?? '',
    formatStudyDuration(recap.todaySeconds), webText.recapBrand, '0123456789.·+/시간분일등명',
  ].join('')
  const trophy = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`sticker load failed: ${trophyUrl}`))
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

// ── 카드 ──

export function drawCard(ctx: CanvasRenderingContext2D, recap: StudyRecap, assets: CardAssets): void {
  const L = cardLayout(recap)
  const W = face.width
  const top = tapeTop
  // 종이 턱 + 크림 종이.
  ctx.fillStyle = c.ledge
  ctx.beginPath(); ctx.roundRect(0, top + face.ledge, W, L.faceHeight, face.radius); ctx.fill()
  ctx.fillStyle = c.paper
  ctx.beginPath(); ctx.roundRect(0, top, W, L.faceHeight, face.radius); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.roundRect(0, top, W, L.faceHeight, face.radius); ctx.clip()
  grain(ctx, 0, top, W, L.faceHeight, 7, 1600)
  ctx.restore()

  // 1. 오늘 공부한 시간.
  text(ctx, webText.recapTimeLabel, W / 2, L.timeLabel, { font: `800 15px ${fonts.sans}`, color: c.inkSoft, align: 'center' })
  drawDuration(ctx, recap.todaySeconds, W / 2, L.timeBase, W - 40)

  // 2. 목표/어제 대비 알약.
  const side = sideLabel(recap)
  if (side && L.side) {
    const reached = goalReached(recap)
    const font = `800 14px ${fonts.sans}`
    const w = measure(ctx, side, font) + 30
    const x = (W - w) / 2
    if (reached) { ctx.fillStyle = c.sunLedge; ctx.beginPath(); ctx.roundRect(x, L.side.y + 3, w, 28, 14); ctx.fill() }
    ctx.fillStyle = reached ? c.sun : c.muted
    ctx.beginPath(); ctx.roundRect(x, L.side.y, w, 28, 14); ctx.fill()
    text(ctx, side, W / 2, L.side.y + 19, { font, color: reached ? c.onSun : c.ink, align: 'center' })
  }

  // 3. 연속 공부 · 방 순위 칸.
  drawTiles(ctx, recap, assets, L.tiles.y)

  // 4. 사진.
  drawPhoto(ctx, recap, L.photo)

  drawTape(ctx, W / 2, top + 2)
}

/** 큰 칸: 왼쪽 연속 공부(불꽃 + n일), 오른쪽 방 순위(트로피 + n등, 햇살 칸). 순위가 없으면 연속 칸이 꽉 찬다. */
function drawTiles(ctx: CanvasRenderingContext2D, recap: StudyRecap, assets: CardAssets, y: number) {
  const x0 = face.inset
  const full = face.width - face.inset * 2
  const w = recap.rank ? (full - tile.gap) / 2 : full
  const box = (x: number, face_: string, ledge: string) => {
    ctx.fillStyle = ledge
    ctx.beginPath(); ctx.roundRect(x, y + tile.ledge, w, tile.height, tile.radius); ctx.fill()
    ctx.fillStyle = face_
    ctx.beginPath(); ctx.roundRect(x, y, w, tile.height, tile.radius); ctx.fill()
  }
  /** 라벨(위) + 아이콘 + 큰 숫자 + 단위(아래 줄 가운데). */
  const value = (x: number, label: string, icon: (ix: number, iy: number) => void, num: string, unit: string, ink: string, soft: string, tail?: string) => {
    text(ctx, label, x + w / 2, y + 26, { font: `800 13px ${fonts.sans}`, color: soft, align: 'center' })
    const numFont = `800 40px ${fonts.round}`
    const unitFont = `800 17px ${fonts.round}`
    const tailFont = `800 13px ${fonts.sans}`
    const iconW = 34
    const tailW = tail ? 5 + measure(ctx, tail, tailFont) : 0
    const total = iconW + 6 + measure(ctx, num, numFont) + 3 + measure(ctx, unit, unitFont) + tailW
    let cx = x + (w - total) / 2
    const base = y + 74
    icon(cx, base - 32)
    cx += iconW + 6
    text(ctx, num, cx, base, { font: numFont, color: ink })
    cx += measure(ctx, num, numFont) + 3
    text(ctx, unit, cx, base, { font: unitFont, color: soft })
    if (tail) text(ctx, tail, cx + measure(ctx, unit, unitFont) + 5, base, { font: tailFont, color: soft })
  }
  const lit = recap.streakDays > 0
  box(x0, c.muted, c.mutedLedge)
  value(x0, webText.recapStreakLabel, (ix, iy) => flame(ctx, ix + 2, iy - 2, 36, lit), String(recap.streakDays), webText.recapStreakUnit, lit ? c.ink : c.inkSoft, c.inkSoft)
  if (recap.rank) {
    const x = x0 + w + tile.gap
    box(x, c.sun, c.sunLedge)
    value(x, webText.recapRankLabel, (ix, iy) => { ctx.drawImage(assets.trophy, ix - 2, iy - 4, 38, 38) }, String(recap.rank.position), webText.recapRankUnit, c.onSun, 'rgba(94,74,50,0.72)', webText.recapRankTotal(recap.rank.total))
  }
}

/** 사진: 둥근 칸, 오른쪽 아래에 필름 카메라식 주황 날짜. */
function drawPhoto(ctx: CanvasRenderingContext2D, recap: StudyRecap, p: CardLayout['photo']) {
  const { x, y, width: w, height: h } = p
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.clip()
  if (recap.photo) {
    const img = recap.photo
    const s = Math.max(w / img.width, h / img.height)
    ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s)
  } else {
    ctx.fillStyle = c.muted
    ctx.fillRect(x, y, w, h)
    ctx.save(); ctx.translate(x, y); paintClockField(ctx, w, h, c.muted, c.line, true); ctx.restore()
  }
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = 'rgba(94,74,50,0.12)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 18); ctx.stroke()
  ctx.restore()
  const [yy, mm, dd] = recap.studyDate.split('-')
  const stamp = `'${yy!.slice(2)} ${mm} ${dd}`
  const dx = x + w - 16
  const dy = y + h - 16
  ctx.save()
  ctx.font = `800 19px ${fonts.mono}`
  ctx.letterSpacing = '2px'
  ctx.textAlign = 'right'
  // 밝은 사진 위에서도 읽히게 어두운 그늘을 먼저, 그 위에 주황 글자와 번짐.
  ctx.fillStyle = 'rgba(40,20,10,0.45)'
  ctx.fillText(stamp, dx + 1, dy + 1.5)
  ctx.shadowColor = 'rgba(255,120,40,0.9)'; ctx.shadowBlur = 8
  ctx.fillStyle = '#ff9a4a'
  ctx.fillText(stamp, dx, dy)
  ctx.restore()
}

/** "6시간 25분": 숫자는 크게, 단위는 작게, 숫자 아래 절반에 햇살 형광펜. */
function drawDuration(ctx: CanvasRenderingContext2D, seconds: number, mid: number, baseline: number, maxWidth: number) {
  const parts = formatStudyDuration(seconds).match(/\d+|\D+/g) ?? []
  let big = 76
  const layout = () => parts.map((p) => {
    const digit = /\d/.test(p)
    const value = digit ? p : p.trim()
    const font = digit ? `800 ${big}px ${fonts.round}` : `800 ${Math.round(big * 0.38)}px ${fonts.round}`
    return { value, digit, font, width: measure(ctx, value, font) }
  })
  let items = layout()
  const gap = (i: number) => (i === 0 ? 0 : items[i]!.digit ? 12 : 4)
  const total = () => items.reduce((sum, it, i) => sum + it.width + gap(i), 0)
  while (total() > maxWidth && big > 40) { big -= 2; items = layout() }
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

/** 햇살 노랑 마스킹 테이프(양끝을 손으로 찢은 톱니). 카드 위 가장자리에 걸친다. */
function drawTape(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const w = 104
  const h = 28
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((-3 * Math.PI) / 180)
  ctx.fillStyle = 'rgba(248,214,106,0.86)'
  ctx.beginPath()
  ctx.moveTo(-w / 2, -h / 2)
  for (let i = 0; i <= 6; i++) ctx.lineTo(-w / 2 + (i % 2 ? 3 : 0), -h / 2 + (h * i) / 6)
  for (let i = 6; i >= 0; i--) ctx.lineTo(w / 2 - (i % 2 ? 3 : 0), -h / 2 + (h * i) / 6)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(-w / 2 + 6, -h / 2 + 4, w - 12, 4)
  ctx.restore()
}

// ── 홀로그램 포일(저장 이미지용) ──

/**
 * 화면의 CSS 포일(recap.module.css .foil)을 한 순간(빛이 왼쪽 위)으로 굳혀 카드 얼굴에 입힌다:
 * 곱하기 무지개(얼굴 전체) → 옅은 반짝이 → 사진 칸에만 닷지 빛 띠·반짝이·에칭 줄·부드러운 빛 반사.
 */
export function drawFoil(ctx: CanvasRenderingContext2D, recap: StudyRecap): void {
  const L = cardLayout(recap)
  const W = face.width
  const top = tapeTop
  const H = L.faceHeight
  ctx.save()
  ctx.beginPath(); ctx.roundRect(0, top, W, H, face.radius); ctx.clip()
  const angle = ((115 - 90) * Math.PI) / 180
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const along = (cx: number, cy: number, span: number, from: number, to: number) =>
    ctx.createLinearGradient(cx + dx * span * from, cy + dy * span * from, cx + dx * span * to, cy + dy * span * to)

  // 무지개(곱하기): 화면과 같은 색 순서를 두 바퀴.
  const hues = [[0, 83], [40, 80], [70, 78], [150, 80], [195, 80], [250, 85], [310, 85], [360, 83]] as const
  const rainbow = along(W / 2, top + H / 2, W * Math.abs(dx) + H * Math.abs(dy), -0.5, 0.5)
  for (let k = 0; k < 2; k++) hues.forEach(([h, l], i) => rainbow.addColorStop(Math.min(1, (k * 7 + i) / 15), `hsl(${h} 95% ${l}%)`))
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = 0.4
  ctx.fillStyle = rainbow
  ctx.fillRect(0, top, W, H)

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
  specks(0, top, W, H, 2400, 0.3)

  const { x: px, y: py, width: pw, height: ph } = L.photo
  ctx.save()
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 18); ctx.clip()
  const band = along(px + pw / 2, py + ph / 2, pw * Math.abs(dx) + ph * Math.abs(dy), -0.5, 0.5)
  band.addColorStop(0, 'rgba(255,255,255,0)')
  band.addColorStop(0.2, 'rgba(255,255,255,0)')
  band.addColorStop(0.3, 'hsla(50,100%,80%,0.75)')
  band.addColorStop(0.35, 'hsla(180,100%,82%,0.8)')
  band.addColorStop(0.4, 'hsla(290,100%,86%,0.75)')
  band.addColorStop(0.5, 'rgba(255,255,255,0)')
  band.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalCompositeOperation = 'color-dodge'
  ctx.globalAlpha = 0.45
  ctx.fillStyle = band
  ctx.fillRect(px, py, pw, ph)
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 1
  specks(px, py, pw, ph, 1300, 0.8)
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

  // 카드: 아래 날짜·이름 자리(60)를 남기고 세로 가운데, 살짝 기울여 그림자와 함께. 길면 줄인다.
  const L = cardLayout(recap)
  const k = Math.min(1, (H - 150) / L.height)
  const cx = W / 2
  const cy = (H - 60) / 2 + 16
  ctx.save()
  ctx.translate(cx, cy); ctx.scale(k, k); ctx.rotate((-1.5 * Math.PI) / 180); ctx.translate(-L.width / 2, -L.height / 2)
  const layerCanvas = layer(L.width, L.height, scale, (cc) => { drawCard(cc, recap, assets); drawFoil(cc, recap) })
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.24)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 14
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

function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, count: number) {
  let a = seed >>> 0
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let r = Math.imul(a ^ (a >>> 15), 1 | a)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
  ctx.save()
  ctx.fillStyle = c.ink
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.015 + rand() * 0.025
    ctx.fillRect(x + rand() * w, y + rand() * h, 0.6, 0.6)
  }
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
