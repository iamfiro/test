// "공부 여권" 카드를 캔버스에 그린다. 화면 미리보기와 저장·공유 이미지가 같은 그림이 되도록 DOM이 아니라
// 캔버스 한 곳에서만 그린다. 인스타그램 스토리 크기(1080×1920, 9:16).
// 앱에 같은 화면이 없어 섬 언어로 새로 짰다(사용자 결정 2026-11-23: 그래프 없이 바로 자랑할 수 있는 카드,
// 비주얼 아트 우선). 구성: 시계 무늬 호수 바탕 위 종이 꽃가루, 살짝 기운 크림 여권 카드(턱·그림자),
// 햇살 노랑 머리띠, 마스킹 테이프로 붙인 폴라로이드(3D 방에서 찍은 내 자리), 잉크 번진 주황 도장,
// 절취선과 양옆 펀치 홈, 숫자는 크고 단위는 작은 공부 시간, 과목·연속 칸, 호수 물결 띠, 앱 입체 스티커.
// 색은 tokens.css 낮 팔레트 값 그대로 고정한다(다크 모드에서 저장해도 같은 카드가 나오게).
import { paintClockField } from '../../../core/ui/IslandBackground'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { formatStudyDuration } from '../home/studyFormat'
import { flameShape } from '../stats/StreakFlame'
import { goalReached, type StudyRecap } from './studyRecap'

/** 논리 크기(앱 폭에 가까운 432pt)로 그리고 2.5배로 내보낸다. */
export const cardSize = { width: 432, height: 768, scale: 2.5 } as const
/** 3D 방 사진 크기(CSS px). 폴라로이드 사진 칸과 같은 비율. */
export const photoSize = { width: 204, height: 250 } as const

const c = {
  lake: '#609baf', lakePattern: '#528ba0', lakeDeep: '#3e7f95',
  paper: '#fffaeb', paperShade: '#f6eed6', ledge: '#e7daba', line: '#e2d6b8', muted: '#f1e8d2',
  meadow: '#f7e7b0',
  ink: '#5e4a32', inkSoft: '#9a8667',
  leaf: '#5dae6b', studying: '#f26a2e', studyingDeep: '#d9531c',
  sun: '#f8d66a', sunLedge: '#d9b246', onSun: '#5e4a32',
  white: '#ffffff',
}

const round = '"TmoneyRoundWind", "Pretendard Variable", sans-serif'
const sans = '"Pretendard Variable", Pretendard, -apple-system, sans-serif'
const weekdays = ['월', '화', '수', '목', '금', '토', '일']

/** 카드 자체 크기(논리). 높이는 사진·비교 문구 유무로 정한다. */
const cardW = 356
const ledge = 7
const radius = 30
const header = 58
const wave = 52

/** 카드에 붙이는 앱 입체 스티커(원본 PocketTime assets/icons, 공부 화면 버튼). */
const stickerUrls = { trophy: '/assets/icons/study_trophy.png', target: '/assets/icons/study_focus.png' } as const
export type RecapStickers = Record<keyof typeof stickerUrls, HTMLImageElement>

/** 글꼴과 스티커 그림을 미리 읽는다(웹 글꼴은 처음 쓰일 때 내려받아 첫 그림에 빠질 수 있다). */
export async function loadRecapAssets(recap: StudyRecap): Promise<RecapStickers> {
  const sample = recapTexts(recap).join('')
  const image = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`sticker load failed: ${src}`))
    img.src = src
  })
  const [trophy, target] = await Promise.all([
    image(stickerUrls.trophy),
    image(stickerUrls.target),
    document.fonts.load(`800 40px ${round}`, sample),
    document.fonts.load(`600 16px ${sans}`, sample),
    document.fonts.load(`700 16px ${sans}`, sample),
    document.fonts.load(`800 16px ${sans}`, sample),
  ])
  return { trophy, target }
}

function recapTexts(recap: StudyRecap): string[] {
  return [
    webText.recapTitle, webText.recapBrand, recap.nickname, dateLabel(recap.studyDate), t('studyStatsTodayTitle'),
    formatStudyDuration(recap.todaySeconds), compareLabel(recap) ?? '', stampLabel(recap), stampDate(recap.studyDate),
    subjectLabel(recap), webText.recapTopSubject, webText.homeStudyStreakLabel, t('studyStatsStreakValue', { count: recap.streakDays }), '0123456789.',
  ]
}

export function drawRecapCard(canvas: HTMLCanvasElement, recap: StudyRecap, stickers: RecapStickers): void {
  const { width: W, height: H, scale } = cardSize
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = context(canvas)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.imageSmoothingQuality = 'high'

  // 바탕: 시계 무늬 호수 + 종이 꽃가루(그라데이션 광원은 쓰지 않는다).
  paintClockField(ctx, W, H, c.lake, c.lakePattern, true)
  drawConfetti(ctx, W, H)

  // 카드: 따로 그린 뒤 살짝 기울여 붙인다(그림자는 붙일 때).
  const cardH = cardHeight(recap)
  const card = renderCard(recap, cardH, scale)
  const cx = W / 2
  const cy = H / 2 + 4
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((-2.2 * Math.PI) / 180)
  ctx.shadowColor = 'rgba(20,45,55,0.38)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetY = 14
  ctx.drawImage(card, -cardW / 2, -(cardH + ledge) / 2, cardW, cardH + ledge)
  ctx.restore()

  // 스티커: 목표를 채웠으면 트로피, 아니면 과녁. 카드 오른쪽 아래 물결 띠에 걸쳐 붙인다.
  const sticker = goalReached(recap) ? stickers.trophy : stickers.target
  pasteSticker(ctx, sticker, cx + cardW / 2 - 30, cy + (cardH + ledge) / 2 - 52, 86, 12)
}

// ── 카드 ──

function cardHeight(recap: StudyRecap): number {
  const photo = recap.photo ? polaroidH() + 30 : 18
  return header + 22 + photo + 30 + 34 + 62 + (compareLabel(recap) ? 30 : 6) + 22 + 50 + 22 + wave
}

function polaroidH() { return 10 + photoSize.height + 44 }

function renderCard(recap: StudyRecap, cardH: number, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(cardW * scale)
  canvas.height = Math.ceil((cardH + ledge) * scale)
  const ctx = context(canvas)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.imageSmoothingQuality = 'high'
  const W = cardW
  const mid = W / 2

  // 턱 + 종이.
  ctx.fillStyle = c.ledge
  ctx.beginPath(); ctx.roundRect(0, ledge, W, cardH, radius); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.roundRect(0, 0, W, cardH, radius); ctx.clip()
  ctx.fillStyle = c.paper
  ctx.fillRect(0, 0, W, cardH)
  ctx.save(); ctx.globalAlpha = 0.45; paintClockField(ctx, W, cardH, c.paper, c.muted, true); ctx.restore()
  paperGrain(ctx, W, cardH)

  // 머리띠: 햇살 노랑, 아래 가장자리는 톱니(우표 가장자리) 대신 부드러운 물결.
  ctx.fillStyle = c.sun
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, header - 6)
  for (let x = W; x > 0; x -= 16) ctx.quadraticCurveTo(x - 8, header + 4, x - 16, header - 6)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(217,178,70,0.55)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5])
  ctx.beginPath(); ctx.moveTo(18, header - 14); ctx.lineTo(W - 18, header - 14); ctx.stroke()
  ctx.setLineDash([])
  text(ctx, webText.recapTitle, 22, 36, { font: `800 21px ${round}`, color: c.onSun })
  text(ctx, stampDate(recap.studyDate), W - 22, 34, { font: `800 13px ${round}`, color: c.onSun, align: 'right', alpha: 0.7 })

  // 아래 호수 띠.
  drawWaves(ctx, 0, cardH - wave, W, wave)
  ctx.restore()

  let y = header + 22
  if (recap.photo) {
    drawPolaroid(ctx, recap, mid, y)
    y += polaroidH() + 30
  } else {
    drawStamp(ctx, recap, W - 62, header + 40, 40)
    text(ctx, ellipsize(ctx, recap.nickname, `800 24px ${round}`, W - 150), 24, y + 24, { font: `800 24px ${round}`, color: c.ink })
    y += 18
  }

  // 절취선 + 양옆 펀치 홈(카드를 뚫어 뒤 바탕이 보이게).
  const cut = y
  ctx.save()
  ctx.strokeStyle = c.line; ctx.lineWidth = 2; ctx.setLineDash([2, 7]); ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(24, cut); ctx.lineTo(W - 24, cut); ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  for (const x of [0, W]) { ctx.beginPath(); ctx.arc(x, cut, 13, 0, Math.PI * 2); ctx.fill() }
  ctx.restore()
  y += 30

  text(ctx, `${t('studyStatsTodayTitle')} · ${dateLabel(recap.studyDate)}`, mid, y + 4, { font: `700 12.5px ${sans}`, color: c.inkSoft, align: 'center' })
  y += 34
  drawDuration(ctx, recap.todaySeconds, mid, y + 46, W - 44)
  y += 62
  const compare = compareLabel(recap)
  if (compare) {
    drawPill(ctx, compare, mid, y + 4)
    y += 30
  } else {
    y += 6
  }
  y += 22
  drawFields(ctx, recap, y)
  return canvas
}

/** 마스킹 테이프로 붙인 폴라로이드, 아래 여백에 닉네임. 오른쪽 위에 도장. */
function drawPolaroid(ctx: CanvasRenderingContext2D, recap: StudyRecap, mid: number, top: number) {
  const pw = photoSize.width + 20
  const ph = polaroidH()
  ctx.save()
  ctx.translate(mid, top + ph / 2)
  ctx.rotate((2.4 * Math.PI) / 180)
  ctx.shadowColor = 'rgba(94,74,50,0.28)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 6
  ctx.fillStyle = c.white
  ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 6); ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.save()
  ctx.beginPath(); ctx.roundRect(-pw / 2 + 10, -ph / 2 + 10, photoSize.width, photoSize.height, 3); ctx.clip()
  const photo = recap.photo!
  const s = Math.max(photoSize.width / photo.width, photoSize.height / photo.height)
  ctx.drawImage(photo, -photo.width * s / 2, -ph / 2 + 10 + photoSize.height / 2 - photo.height * s / 2, photo.width * s, photo.height * s)
  // 사진 위 아주 옅은 안쪽 그늘(인화지 느낌).
  const inner = ctx.createLinearGradient(0, -ph / 2, 0, -ph / 2 + photoSize.height + 10)
  inner.addColorStop(0, 'rgba(0,0,0,0.10)'); inner.addColorStop(0.18, 'rgba(0,0,0,0)'); inner.addColorStop(1, 'rgba(0,0,0,0.06)')
  ctx.fillStyle = inner
  ctx.fillRect(-pw / 2, -ph / 2, pw, photoSize.height + 20)
  ctx.restore()
  text(ctx, ellipsize(ctx, recap.nickname, `800 20px ${round}`, pw - 28), 0, ph / 2 - 14, { font: `800 20px ${round}`, color: c.ink, align: 'center' })
  // 테이프 두 조각.
  tape(ctx, -pw / 2 + 12, -ph / 2 - 2, -38, 'rgba(248,214,106,0.82)')
  tape(ctx, pw / 2 - 12, -ph / 2 - 2, 36, 'rgba(155,208,190,0.78)')
  ctx.restore()
  // 도장은 사진 오른쪽 아래 모서리에 걸쳐 찍는다(테이프와 겹치지 않게).
  drawStamp(ctx, recap, mid + pw / 2 - 8, top + photoSize.height - 18, 44)
}

function tape(ctx: CanvasRenderingContext2D, x: number, y: number, deg: number, color: string) {
  const w = 62
  const h = 20
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.fillStyle = color
  ctx.beginPath()
  // 양끝을 손으로 찢은 듯한 톱니.
  ctx.moveTo(-w / 2, -h / 2)
  for (let i = 0; i <= 4; i++) ctx.lineTo(-w / 2 + (i % 2 ? 2.5 : 0), -h / 2 + (h * i) / 4)
  ctx.lineTo(w / 2, h / 2)
  for (let i = 4; i >= 0; i--) ctx.lineTo(w / 2 - (i % 2 ? 2.5 : 0), -h / 2 + (h * i) / 4)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(-w / 2 + 4, -h / 2 + 3, w - 8, 3)
  ctx.restore()
}

/** 잉크 도장: 겹 테두리, 위 작은 시계, 가운데 문구, 아래 날짜. 잉크가 덜 묻은 자국을 지워 낸다. */
function drawStamp(ctx: CanvasRenderingContext2D, recap: StudyRecap, x: number, y: number, r: number) {
  const scale = ctx.getTransform().a
  const size = Math.ceil(r * 2 + 8)
  const stamp = document.createElement('canvas')
  stamp.width = Math.ceil(size * scale)
  stamp.height = Math.ceil(size * scale)
  const s = context(stamp)
  s.setTransform(scale, 0, 0, scale, 0, 0)
  s.translate(size / 2, size / 2)
  // 사진 위에서도 읽히도록 아주 옅은 종이 바탕.
  s.fillStyle = 'rgba(255,250,235,0.78)'
  s.beginPath(); s.arc(0, 0, r - 1, 0, Math.PI * 2); s.fill()
  s.strokeStyle = c.studying
  s.fillStyle = c.studying
  s.lineWidth = 3.4
  s.beginPath(); s.arc(0, 0, r - 2, 0, Math.PI * 2); s.stroke()
  s.lineWidth = 1.4
  s.beginPath(); s.arc(0, 0, r - 7.5, 0, Math.PI * 2); s.stroke()
  // 테두리 사이 점 장식.
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2
    if (Math.abs(Math.sin(a)) < 0.35) continue
    s.beginPath(); s.arc(Math.cos(a) * (r - 4.8), Math.sin(a) * (r - 4.8), 0.8, 0, Math.PI * 2); s.fill()
  }
  s.lineWidth = 2; s.lineCap = 'round'
  s.beginPath(); s.arc(0, -r * 0.47, 6.5, 0, Math.PI * 2); s.stroke()
  s.beginPath(); s.moveTo(0, -r * 0.47); s.lineTo(0, -r * 0.47 - 4); s.moveTo(0, -r * 0.47); s.lineTo(3.2, -r * 0.47 + 1.4); s.stroke()
  text(s, stampLabel(recap), 0, 5.5, { font: `800 ${r > 41 ? 15 : 14}px ${round}`, color: c.studying, align: 'center' })
  text(s, stampDate(recap.studyDate), 0, r * 0.5, { font: `800 9.5px ${round}`, color: c.studying, align: 'center' })
  // 잉크가 덜 묻은 자국.
  s.globalCompositeOperation = 'destination-out'
  const rand = seeded(7 + recap.streakDays)
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2
    const d = rand() * r
    s.globalAlpha = 0.25 + rand() * 0.6
    s.beginPath(); s.arc(Math.cos(a) * d, Math.sin(a) * d, 0.4 + rand() * 1.3, 0, Math.PI * 2); s.fill()
  }
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((-15 * Math.PI) / 180)
  ctx.globalAlpha = 0.95
  ctx.drawImage(stamp, -size / 2, -size / 2, size, size)
  ctx.restore()
}

/** "3시간 25분": 숫자는 크게, 단위는 작게 같은 바닥선에. 폭을 넘으면 함께 줄인다. */
function drawDuration(ctx: CanvasRenderingContext2D, seconds: number, mid: number, baseline: number, maxWidth: number) {
  const parts = formatStudyDuration(seconds).match(/\d+|\D+/g) ?? []
  let big = 66
  const layout = () => parts.map((p) => {
    const digit = /\d/.test(p)
    const value = digit ? p : p.trim()
    const font = digit ? `800 ${big}px ${round}` : `800 ${Math.round(big * 0.42)}px ${round}`
    return { value, font, digit, width: measure(ctx, value, font) }
  })
  let items = layout()
  const total = () => items.reduce((sum, it, i) => sum + it.width + (i > 0 ? (it.digit ? 10 : 3) : 0), 0)
  while (total() > maxWidth && big > 30) { big -= 2; items = layout() }
  let x = mid - total() / 2
  items.forEach((it, i) => {
    if (i > 0) x += it.digit ? 10 : 3
    // 숫자에 진한 주황 그림자 한 겹(입체 글씨).
    if (it.digit) text(ctx, it.value, x, baseline + 3, { font: it.font, color: c.studyingDeep })
    text(ctx, it.value, x, baseline, { font: it.font, color: it.digit ? c.studying : c.ink })
    x += it.width
  })
}

function drawPill(ctx: CanvasRenderingContext2D, value: string, mid: number, top: number) {
  const font = `800 12.5px ${sans}`
  const arrow = 14
  const w = measure(ctx, value, font) + 26 + arrow
  ctx.fillStyle = 'rgba(93,174,107,0.14)'
  ctx.beginPath(); ctx.roundRect(mid - w / 2, top, w, 24, 12); ctx.fill()
  // 위 화살표.
  const ax = mid - w / 2 + 13 + 4
  ctx.strokeStyle = c.leaf; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(ax, top + 17); ctx.lineTo(ax, top + 7); ctx.moveTo(ax - 3.5, top + 10.5); ctx.lineTo(ax, top + 7); ctx.lineTo(ax + 3.5, top + 10.5); ctx.stroke()
  text(ctx, value, mid - w / 2 + 13 + arrow, top + 16.5, { font, color: c.leaf })
}

/** 아래 두 칸: 가장 많이 한 과목, 연속 공부. */
function drawFields(ctx: CanvasRenderingContext2D, recap: StudyRecap, y: number) {
  const gap = 10
  const x = 20
  const w = (cardW - 40 - gap) / 2
  const h = 50
  for (let i = 0; i < 2; i++) {
    const fx = x + i * (w + gap)
    ctx.fillStyle = c.line
    ctx.beginPath(); ctx.roundRect(fx, y + 2.5, w, h, 16); ctx.fill()
    ctx.fillStyle = c.muted
    ctx.beginPath(); ctx.roundRect(fx, y, w, h, 16); ctx.fill()
  }
  const labelFont = `700 10.5px ${sans}`
  text(ctx, webText.recapTopSubject, x + w / 2, y + 17, { font: labelFont, color: c.inkSoft, align: 'center' })
  const nameFont = `800 13.5px ${sans}`
  const name = ellipsize(ctx, subjectLabel(recap), nameFont, w - 36)
  const chipW = measure(ctx, name, nameFont) + 20
  ctx.fillStyle = recap.topSubject.fill
  ctx.beginPath(); ctx.roundRect(x + (w - chipW) / 2, y + 23, chipW, 21, 10.5); ctx.fill()
  text(ctx, name, x + w / 2, y + 38.5, { font: nameFont, color: recap.topSubject.ink, align: 'center' })

  const sx = x + w + gap
  text(ctx, webText.homeStudyStreakLabel, sx + w / 2, y + 17, { font: labelFont, color: c.inkSoft, align: 'center' })
  const value = t('studyStatsStreakValue', { count: recap.streakDays })
  const vf = `800 17px ${round}`
  const fw = 19 * 0.88
  const total = fw + 5 + measure(ctx, value, vf)
  const left = sx + (w - total) / 2
  drawFlame(ctx, left, y + 24, 19, recap.streakDays > 0)
  text(ctx, value, left + fw + 5, y + 41, { font: vf, color: c.ink })
}

function drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, lit: boolean) {
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

/** 카드 아래 호수 띠: 두 겹 물결, 작은 시계와 잔물결, 서비스 이름. */
function drawWaves(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const band = (top: number, bump: number, color: string, phase: number) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x, top + 6)
    for (let bx = x - phase; bx < x + w; bx += bump) ctx.quadraticCurveTo(bx + bump / 2, top - 4, bx + bump, top + 6)
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill()
  }
  band(y - 4, 26, '#9fcbd8', 9)
  band(y + 4, 20, c.lake, 0)
  ctx.strokeStyle = c.lakePattern; ctx.lineWidth = 2.2; ctx.lineCap = 'round'
  for (const [wx, wy] of [[x + 20, y + 30], [x + 112, y + 38], [x + 204, y + 28]] as const) {
    ctx.beginPath(); ctx.moveTo(wx, wy)
    ctx.quadraticCurveTo(wx + 7, wy - 5, wx + 14, wy); ctx.quadraticCurveTo(wx + 21, wy + 5, wx + 28, wy); ctx.stroke()
  }
  ctx.lineWidth = 1.8
  for (const [kx, ky] of [[x + 80, y + 26], [x + 176, y + 40]] as const) {
    ctx.beginPath(); ctx.arc(kx, ky, 5.5, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx, ky - 3); ctx.moveTo(kx, ky); ctx.lineTo(kx + 2.6, ky + 1); ctx.stroke()
  }
  text(ctx, webText.recapBrand, x + 20, y + h - 10, { font: `800 12px ${round}`, color: c.white, alpha: 0.95 })
}

// ── 바탕 꾸밈 ──

/** 종이 꽃가루: 정해진 씨앗으로 늘 같은 자리. 카드 뒤에 깔린다. */
function drawConfetti(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const rand = seeded(23)
  const colors = [c.sun, c.white, c.studying, '#9fd7c1', c.sun, c.white]
  for (let i = 0; i < 34; i++) {
    const x = rand() * W
    const y = rand() * H
    // 카드 한가운데는 비워 둔다(어차피 가려진다).
    if (x > 50 && x < W - 50 && y > 70 && y < H - 70) continue
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rand() * Math.PI)
    ctx.fillStyle = colors[i % colors.length]!
    ctx.globalAlpha = 0.85
    const kind = i % 3
    if (kind === 0) { ctx.beginPath(); ctx.roundRect(-5, -2.2, 10, 4.4, 2.2); ctx.fill() }
    else if (kind === 1) { ctx.beginPath(); ctx.arc(0, 0, 2.6 + rand() * 1.6, 0, Math.PI * 2); ctx.fill() }
    else { star(ctx, 4.5 + rand() * 2) }
    ctx.restore()
  }
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const d = i % 2 ? r * 0.42 : r
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d)
  }
  ctx.closePath(); ctx.fill()
}

function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const rand = seeded(5)
  ctx.save()
  ctx.fillStyle = c.ink
  for (let i = 0; i < 1400; i++) {
    ctx.globalAlpha = 0.02 + rand() * 0.035
    ctx.fillRect(rand() * w, rand() * h, 0.6, 0.6)
  }
  ctx.restore()
}

function pasteSticker(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, size: number, deg: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.shadowColor = 'rgba(20,45,55,0.35)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 5
  ctx.drawImage(img, -size / 2, -size / 2, size, size)
  ctx.restore()
}

// ── 도우미 ──

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  return ctx
}

/** 늘 같은 꾸밈 자리를 위한 작은 난수(mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let r = Math.imul(a ^ (a >>> 15), 1 | a)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, o: { font: string; color: string; align?: CanvasTextAlign; alpha?: number }) {
  ctx.save()
  ctx.font = o.font
  ctx.fillStyle = o.color
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  if (o.alpha != null) ctx.globalAlpha *= o.alpha
  ctx.fillText(value, x, y)
  ctx.restore()
}

function measure(ctx: CanvasRenderingContext2D, value: string, font: string): number {
  ctx.save(); ctx.font = font
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

function dateLabel(studyDate: string): string {
  const [y, m, d] = parseDate(studyDate)
  return webText.recapDate(m, d, weekdays[(new Date(y, m - 1, d).getDay() + 6) % 7]!)
}

function stampDate(studyDate: string): string {
  const [y, m, d] = parseDate(studyDate)
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`
}

/** 자랑 카드라 어제보다 더 했을 때만 비교 문구를 쓴다. */
function compareLabel(recap: StudyRecap): string | null {
  const diff = recap.todaySeconds - recap.yesterdaySeconds
  if (diff <= 0 || Math.trunc(diff / 60) === 0) return null
  return t('studyStatsVsYesterdayMore', { duration: formatStudyDuration(diff) })
}

function stampLabel(recap: StudyRecap): string {
  return goalReached(recap) ? webText.recapStampGoal : webText.recapStampDone
}

function subjectLabel(recap: StudyRecap): string {
  return recap.topSubject.subject ?? t('studySubjectNone')
}
