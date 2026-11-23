// "오늘의 공부" 카드: 스토리에 올려 오늘 공부한 시간을 자랑하는 세로 폴라로이드 한 장.
// 화면은 레이어(카드·스티커)를 따로 그려 스티커가 나중에 붙게 하고, 저장 이미지(인스타그램 스토리 1080×1920)는
// 같은 함수로 시계 무늬 호수 위에 합친다. 그래서 미리보기와 저장본이 같다.
// 정보는 세 가지만: 사진(3D 방의 내 자리), 오늘 공부한 시간(가장 크게), 연속 공부·목표 달성 한 줄.
// 톤은 앱 공부 화면(사용자 결정 2026-11-23): 섬 팔레트 낮 값(tokens.css), 크림 종이와 턱, 둥근 글꼴, 햇살 노랑 강조,
// 앱 스티커 아트. 그 위에 레인보우 홀로그램 포일(사용자 레퍼런스: 레인보우 레어 카드)을 입힌다. 다크 모드에서 저장해도 같은 이미지가 나오도록 값은 낮 팔레트로 고정한다.
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

/** 카드 레이어(논리 pt). 위 16은 테이프가 삐져나오는 자리, 아래 10은 종이 턱. */
const tapeTop = 16
const face = { width: 368, height: 534, radius: 28, ledge: 10, inset: 14 } as const
export const card = { width: face.width, height: tapeTop + face.height + face.ledge } as const
/** 사진 칸(정사각, 카드 레이어 좌표). 3D 방은 이 비율로 찍는다. */
export const photoSlot = { x: face.inset, y: tapeTop + face.inset, width: face.width - face.inset * 2, height: face.width - face.inset * 2 } as const
/** 목표 달성 스티커(카드 레이어 좌표, 가운데 기준). 오른쪽 위 모서리에 걸쳐 붙는다. */
export const sticker = { x: face.width - 20, y: tapeTop + 12, size: 104, rotate: 12 } as const
/** 앱 스티커 아트(원본 PocketTime assets/icons/study_trophy.png, 공부 화면 트로피 단추). */
const trophyUrl = '/assets/icons/study_trophy.png'

export type CardAssets = { trophy: HTMLImageElement }

/** 글꼴과 스티커 그림을 미리 읽는다(웹 글꼴은 처음 쓰일 때 내려받아 첫 그림에 빠질 수 있다). */
export async function loadCardAssets(recap: StudyRecap): Promise<CardAssets> {
  const sample = [
    webText.recapTimeLabel, webText.recapStreakRow(recap.streakDays), webText.recapGoalReached, sideLabel(recap) ?? '',
    formatStudyDuration(recap.todaySeconds), webText.recapBrand, recap.nickname, '0123456789.·+시간분일', t('studySubjectNone'),
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

/** 아래 줄 오른쪽: 목표를 채웠으면 "목표 달성", 목표가 없고 어제보다 더 했으면 "어제보다 +n". 아니면 없음. */
function sideLabel(recap: StudyRecap): string | null {
  if (goalReached(recap)) return webText.recapGoalReached
  if (recap.goalSeconds != null && recap.goalSeconds > 0) {
    return webText.recapGoalPercent(Math.floor((recap.todaySeconds * 100) / recap.goalSeconds))
  }
  const diff = recap.todaySeconds - recap.yesterdaySeconds
  if (diff > 0 && Math.trunc(diff / 60) > 0) return webText.recapMoreChip(formatStudyDuration(diff))
  return null
}

/** 목표 달성일에만 스티커를 붙인다. */
export function hasSticker(recap: StudyRecap): boolean {
  return goalReached(recap)
}

// ── 카드 ──

export function drawCard(ctx: CanvasRenderingContext2D, recap: StudyRecap): void {
  const W = face.width
  const top = tapeTop
  // 종이 턱 + 크림 종이.
  ctx.fillStyle = c.ledge
  ctx.beginPath(); ctx.roundRect(0, top + face.ledge, W, face.height, face.radius); ctx.fill()
  ctx.fillStyle = c.paper
  ctx.beginPath(); ctx.roundRect(0, top, W, face.height, face.radius); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.roundRect(0, top, W, face.height, face.radius); ctx.clip()
  grain(ctx, 0, top, W, face.height, 7, 1400)
  ctx.restore()

  drawPhoto(ctx, recap)

  // 오늘 공부한 시간(라벨 → 큰 숫자).
  const mid = W / 2
  const photoBottom = photoSlot.y + photoSlot.height
  text(ctx, webText.recapTimeLabel, mid, photoBottom + 34, { font: `700 14px ${fonts.sans}`, color: c.inkSoft, align: 'center' })
  drawDuration(ctx, recap.todaySeconds, mid, photoBottom + 104, W - 48)

  // 점선 + 아래 줄(연속 공부 · 목표 달성/어제보다).
  const rowY = photoBottom + 126
  ctx.save()
  ctx.strokeStyle = c.line; ctx.lineWidth = 2; ctx.setLineDash([2, 6]); ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(26, rowY); ctx.lineTo(W - 26, rowY); ctx.stroke()
  ctx.restore()
  const base = rowY + 34
  const lit = recap.streakDays > 0
  flame(ctx, 26, base - 21, 24, lit)
  text(ctx, webText.recapStreakRow(recap.streakDays), 52, base, { font: `800 17px ${fonts.round}`, color: lit ? c.ink : c.inkSoft })
  const side = sideLabel(recap)
  if (side) {
    const reached = goalReached(recap)
    const font = `800 13px ${fonts.sans}`
    const w = measure(ctx, side, font) + 26
    const x = W - 24 - w
    const y = base - 19
    if (reached) {
      ctx.fillStyle = c.sunLedge
      ctx.beginPath(); ctx.roundRect(x, y + 3, w, 26, 13); ctx.fill()
    }
    ctx.fillStyle = reached ? c.sun : c.muted
    ctx.beginPath(); ctx.roundRect(x, y, w, 26, 13); ctx.fill()
    text(ctx, side, x + w / 2, y + 17.5, { font, color: reached ? c.onSun : c.ink, align: 'center' })
  }

  drawTape(ctx, W / 2, top + 2)
}

/** 사진: 둥근 정사각, 오른쪽 아래에 필름 카메라식 주황 날짜. */
function drawPhoto(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const { x, y, width: w, height: h } = photoSlot
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.clip()
  if (recap.photo) {
    const p = recap.photo
    const s = Math.max(w / p.width, h / p.height)
    ctx.drawImage(p, x + (w - p.width * s) / 2, y + (h - p.height * s) / 2, p.width * s, p.height * s)
  } else {
    ctx.fillStyle = c.muted
    ctx.fillRect(x, y, w, h)
    ctx.save(); ctx.translate(x, y); paintClockField(ctx, w, h, c.muted, c.line, true); ctx.restore()
  }
  ctx.restore()
  // 인화지 테두리선.
  ctx.save()
  ctx.strokeStyle = 'rgba(94,74,50,0.12)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 18); ctx.stroke()
  ctx.restore()
  // 필름 날짜: 주황 글자에 옅은 번짐.
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
  let big = 68
  const layout = () => parts.map((p) => {
    const digit = /\d/.test(p)
    const value = digit ? p : p.trim()
    const font = digit ? `800 ${big}px ${fonts.round}` : `800 ${Math.round(big * 0.4)}px ${fonts.round}`
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
      ctx.save()
      ctx.fillStyle = c.sun
      ctx.beginPath(); ctx.roundRect(x - 4, baseline - big * 0.34, it.width + 8, big * 0.38, big * 0.12); ctx.fill()
      ctx.restore()
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
export function drawFoil(ctx: CanvasRenderingContext2D): void {
  const W = face.width
  const top = tapeTop
  const H = face.height
  ctx.save()
  ctx.beginPath(); ctx.roundRect(0, top, W, H, face.radius); ctx.clip()
  // 115° 방향 축(화면 CSS와 같은 각도).
  const angle = ((115 - 90) * Math.PI) / 180
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const span = W * Math.abs(dx) + H * Math.abs(dy)
  const cx = W / 2
  const cy = top + H / 2
  const along = (from: number, to: number) => ctx.createLinearGradient(cx + dx * span * from, cy + dy * span * from, cx + dx * span * to, cy + dy * span * to)

  // 무지개(곱하기): 화면과 같은 색 순서를 두 바퀴.
  const hues = [[0, 83], [40, 80], [70, 78], [150, 80], [195, 80], [250, 85], [310, 85], [360, 83]] as const
  const rainbow = along(-0.5, 0.5)
  for (let k = 0; k < 2; k++) hues.forEach(([h, l], i) => rainbow.addColorStop(Math.min(1, (k * 7 + i) / 15), `hsl(${h} 95% ${l}%)`))
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = 0.4
  ctx.fillStyle = rainbow
  ctx.fillRect(0, top, W, H)

  // 종이 전체에 아주 옅은 반짝이(오버레이).
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
  specks(0, top, W, H, 2200, 0.3)

  // 강한 빛은 사진 칸에만(화면 .photoFoil과 같다): 빛 띠(닷지) → 반짝이·에칭 줄 → 빛 반사.
  const { x: px, y: py, width: pw, height: ph } = photoSlot
  ctx.save()
  ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 18); ctx.clip()
  const band = along(-0.5, 0.5)
  band.addColorStop(0, 'rgba(255,255,255,0)')
  band.addColorStop(0.2, 'rgba(255,255,255,0)')
  band.addColorStop(0.3, 'hsla(50,100%,80%,0.75)')
  band.addColorStop(0.35, 'hsla(180,100%,82%,0.8)')
  band.addColorStop(0.4, 'hsla(290,100%,86%,0.75)')
  band.addColorStop(0.5, 'rgba(255,255,255,0)')
  band.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalCompositeOperation = 'color-dodge'
  ctx.globalAlpha = 0.55
  ctx.fillStyle = band
  ctx.fillRect(px, py, pw, ph)
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = 1
  specks(px, py, pw, ph, 1500, 0.8)
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

// ── 스티커 ──

/** 목표 달성 트로피 스티커. ctx 원점이 스티커 가운데. */
export function drawSticker(ctx: CanvasRenderingContext2D, assets: CardAssets): void {
  const s = sticker.size
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5
  ctx.drawImage(assets.trophy, -s / 2, -s / 2, s, s)
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

  // 카드: 가운데에 살짝 기울여 그림자와 함께 놓는다.
  const cx = W / 2
  const cy = 372
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((-1.5 * Math.PI) / 180); ctx.translate(-card.width / 2, -card.height / 2)
  const layerCanvas = layer(card.width, card.height, scale, (cc) => { drawCard(cc, recap); drawFoil(cc) })
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.24)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 14
  ctx.drawImage(layerCanvas, 0, 0, card.width, card.height)
  ctx.restore()
  if (hasSticker(recap)) {
    ctx.save(); ctx.translate(sticker.x, sticker.y); ctx.rotate((sticker.rotate * Math.PI) / 180); drawSticker(ctx, assets); ctx.restore()
  }
  ctx.restore()

  // 아래: 날짜 · 서비스 이름.
  const [y, m, d] = recap.studyDate.split('-')
  text(ctx, `${y}.${m}.${d}`, W / 2, H - 92, { font: `700 12px ${fonts.mono}`, color: c.white, align: 'center', shadow: true })
  text(ctx, webText.recapBrand, W / 2, H - 70, { font: `800 15px ${fonts.round}`, color: c.white, align: 'center', shadow: true })
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
