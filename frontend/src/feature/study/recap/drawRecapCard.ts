// "공부 여권" 카드를 캔버스에 그린다. 화면 미리보기와 저장·공유 이미지가 같은 그림이 되도록 DOM이 아니라
// 캔버스 한 곳에서만 그린다. 인스타그램 스토리 크기(1080×1920, 9:16).
// 앱에 같은 화면이 없어 섬 언어로 새로 짰다(사용자 결정 2026-11-23: 그래프 없이 바로 자랑할 수 있는 카드):
// 시계 호수 바탕, 크림 종이 카드(턱), 햇살 노랑 리본, 3D 방에서 찍은 내 사진, 공부 중 주황 도장, 호수 물결 띠.
// 색은 tokens.css 낮 팔레트 값 그대로 고정한다(다크 모드에서 저장해도 같은 카드가 나오게).
import { paintClockField } from '../../../core/ui/IslandBackground'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { formatStudyDuration } from '../home/studyFormat'
import { flameShape } from '../stats/StreakFlame'
import { goalReached, type StudyRecap } from './studyRecap'

/** 논리 크기(앱 폭에 가까운 432pt)로 그리고 2.5배로 내보낸다. */
export const cardSize = { width: 432, height: 768, scale: 2.5 } as const
/** 3D 방 사진 크기(CSS px). 카드 사진 칸과 같은 비율. */
export const photoSize = { width: 210, height: 262 } as const

const c = {
  lake: '#609baf', lakePattern: '#528ba0', lakeDeep: '#4f8ca1',
  paper: '#fffaeb', ledge: '#e7daba', line: '#e9dfc6', muted: '#efe6d0',
  meadow: '#f7e7b0', meadowPattern: '#ebcf7f',
  ink: '#5e4a32', inkSoft: '#9a8667',
  leaf: '#5dae6b', studying: '#f26a2e',
  sun: '#f8d66a', sunLedge: '#d9b246', onSun: '#5e4a32',
  white: '#ffffff',
}

const round = '"TmoneyRoundWind", "Pretendard Variable", sans-serif'
const sans = '"Pretendard Variable", Pretendard, -apple-system, sans-serif'
const weekdays = ['월', '화', '수', '목', '금', '토', '일']

const card = { x: 30, width: 372, radius: 30, ledge: 6, top: 52, wave: 54 }

/** 캔버스가 쓰는 글꼴을 미리 읽는다(웹 글꼴은 처음 쓰일 때 내려받아 첫 그림에 빠질 수 있다). */
export async function loadRecapFonts(recap: StudyRecap): Promise<void> {
  const sample = recapTexts(recap).join('')
  await Promise.all([
    document.fonts.load(`800 40px ${round}`, sample),
    document.fonts.load(`600 16px ${sans}`, sample),
    document.fonts.load(`700 16px ${sans}`, sample),
    document.fonts.load(`800 16px ${sans}`, sample),
  ])
}

function recapTexts(recap: StudyRecap): string[] {
  return [
    webText.recapTitle, webText.recapBrand, recap.nickname, dateLabel(recap.studyDate), t('studyStatsTodayTitle'),
    formatStudyDuration(recap.todaySeconds), compareLabel(recap) ?? '', stampLabel(recap), stampDate(recap.studyDate),
    subjectLabel(recap), webText.recapTopSubject, webText.homeStudyStreakLabel, t('studyStatsStreakValue', { count: recap.streakDays }), '0123456789',
  ]
}

export function drawRecapCard(canvas: HTMLCanvasElement, recap: StudyRecap): void {
  const { width: W, height: H, scale } = cardSize
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  paintClockField(ctx, W, H, c.lake, c.lakePattern, true)

  const compare = compareLabel(recap)
  const photoBlock = recap.photo ? photoSize.height + 14 + 20 : 8
  const height = 52 + photoBlock + 30 + 22 + 26 + 18 + 56 + (compare ? 22 : 0) + 34 + 44 + 24 + card.wave
  const top = Math.max(card.top, (H - height) / 2 + 6)
  const cx = W / 2

  // 카드 몸통(턱 + 크림 종이), 아래 물결 띠는 카드 모양 안에 자른다.
  ctx.fillStyle = 'rgba(0,0,0,0.10)'
  ctx.beginPath(); ctx.roundRect(card.x, top + card.ledge + 6, card.width, height, card.radius); ctx.fill()
  ctx.fillStyle = c.ledge
  ctx.beginPath(); ctx.roundRect(card.x, top + card.ledge, card.width, height, card.radius); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.roundRect(card.x, top, card.width, height, card.radius); ctx.clip()
  ctx.fillStyle = c.paper
  ctx.fillRect(card.x, top, card.width, height)
  paintPaperClocks(ctx, card.x, top, card.width, height - card.wave)
  drawWaves(ctx, card.x, top + height - card.wave, card.width, card.wave)
  ctx.restore()

  drawRibbon(ctx, cx, top)

  let y = top + 52
  if (recap.photo) {
    const fx = cx - photoSize.width / 2 - 7
    drawPhoto(ctx, recap.photo, fx, y)
    drawStamp(ctx, recap, fx + photoSize.width + 14 - 4, y + 30)
    y += photoSize.height + 14 + 20
  } else {
    drawStamp(ctx, recap, card.x + card.width - 58, top + 70)
    y += 8
  }

  text(ctx, ellipsize(ctx, recap.nickname, `800 26px ${round}`, card.width - 48), cx, y + 24, { font: `800 26px ${round}`, color: c.ink, align: 'center' })
  y += 30
  text(ctx, dateLabel(recap.studyDate), cx, y + 16, { font: `700 13px ${sans}`, color: c.inkSoft, align: 'center' })
  y += 22

  // 점선 구분선(여권의 절취선 느낌).
  ctx.save()
  ctx.strokeStyle = c.line; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(card.x + 26, y + 12); ctx.lineTo(card.x + card.width - 26, y + 12); ctx.stroke()
  ctx.restore()
  y += 26

  text(ctx, t('studyStatsTodayTitle'), cx, y + 13, { font: `700 13px ${sans}`, color: c.inkSoft, align: 'center' })
  y += 18
  const total = formatStudyDuration(recap.todaySeconds)
  text(ctx, total, cx, y + 48, { font: `800 ${fitSize(ctx, total, 52, card.width - 40)}px ${round}`, color: c.studying, align: 'center' })
  y += 56
  if (compare) {
    text(ctx, compare, cx, y + 16, { font: `800 13px ${sans}`, color: c.leaf, align: 'center' })
    y += 22
  }
  y += 34

  drawFields(ctx, recap, y)
}

// ── 카드 조각 ──

function drawRibbon(ctx: CanvasRenderingContext2D, cx: number, cardTop: number) {
  const w = 200
  const h = 40
  const y = cardTop - h / 2
  const tail = 30
  // 리본 꼬리(뒤, 진한 노랑) — 안쪽을 V자로 판다.
  ctx.fillStyle = c.sunLedge
  for (const side of [-1, 1]) {
    const inner = cx + side * (w / 2 - 12)
    const outer = cx + side * (w / 2 + tail)
    ctx.beginPath()
    ctx.moveTo(inner, y + 8); ctx.lineTo(outer, y + 8); ctx.lineTo(outer - side * 10, y + 8 + h / 2); ctx.lineTo(outer, y + 8 + h)
    ctx.lineTo(inner, y + 8 + h); ctx.closePath(); ctx.fill()
  }
  ctx.fillStyle = c.sunLedge
  ctx.beginPath(); ctx.roundRect(cx - w / 2, y + 4, w, h, 10); ctx.fill()
  ctx.fillStyle = c.sun
  ctx.beginPath(); ctx.roundRect(cx - w / 2, y, w, h, 10); ctx.fill()
  text(ctx, webText.recapTitle, cx, y + 28, { font: `800 20px ${round}`, color: c.onSun, align: 'center' })
}

function drawPhoto(ctx: CanvasRenderingContext2D, photo: HTMLCanvasElement, x: number, y: number) {
  const w = photoSize.width + 14
  const h = photoSize.height + 14
  ctx.fillStyle = c.meadowPattern
  ctx.beginPath(); ctx.roundRect(x, y + 4, w, h, 22); ctx.fill()
  ctx.fillStyle = c.meadow
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill()
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x + 7, y + 7, photoSize.width, photoSize.height, 16); ctx.clip()
  // 사진은 같은 비율로 찍었지만 혹시 다르면 가운데를 채워 자른다.
  const s = Math.max(photoSize.width / photo.width, photoSize.height / photo.height)
  const dw = photo.width * s
  const dh = photo.height * s
  ctx.drawImage(photo, x + 7 + (photoSize.width - dw) / 2, y + 7 + (photoSize.height - dh) / 2, dw, dh)
  ctx.restore()
}

/** 공부 중 주황 도장. 목표를 채웠으면 "목표 달성", 아니면 "공부 완료". */
function drawStamp(ctx: CanvasRenderingContext2D, recap: StudyRecap, x: number, y: number) {
  const r = 46
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((-14 * Math.PI) / 180)
  ctx.globalAlpha = 0.92
  ctx.fillStyle = 'rgba(255,250,235,0.85)'
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = c.studying
  ctx.lineWidth = 3.5
  ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(0, 0, r - 8, 0, Math.PI * 2); ctx.stroke()
  // 위 작은 시계(섬 무늬와 같은 모양).
  ctx.lineWidth = 2; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(0, -21, 7, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(0, -25.5); ctx.moveTo(0, -21); ctx.lineTo(3.5, -19.5); ctx.stroke()
  text(ctx, stampLabel(recap), 0, 6, { font: `800 15px ${round}`, color: c.studying, align: 'center' })
  text(ctx, stampDate(recap.studyDate), 0, 24, { font: `800 11px ${sans}`, color: c.studying, align: 'center' })
  ctx.restore()
}

/** 아래 두 칸: 가장 많이 한 과목, 연속 공부. */
function drawFields(ctx: CanvasRenderingContext2D, recap: StudyRecap, y: number) {
  const gap = 10
  const x = card.x + 20
  const w = (card.width - 40 - gap) / 2
  const h = 44
  for (let i = 0; i < 2; i++) {
    const fx = x + i * (w + gap)
    ctx.fillStyle = c.muted
    ctx.beginPath(); ctx.roundRect(fx, y, w, h, 14); ctx.fill()
  }
  // 과목: 과목 색 칩에 이름.
  const label = webText.recapTopSubject
  text(ctx, label, x + 12, y - 6, { font: `700 11px ${sans}`, color: c.inkSoft })
  const name = ellipsize(ctx, subjectLabel(recap), `800 14px ${sans}`, w - 40)
  const chipW = measure(ctx, name, `800 14px ${sans}`) + 20
  ctx.fillStyle = recap.topSubject.fill
  ctx.beginPath(); ctx.roundRect(x + (w - chipW) / 2, y + 9, chipW, 26, 13); ctx.fill()
  text(ctx, name, x + w / 2, y + 27, { font: `800 14px ${sans}`, color: recap.topSubject.ink, align: 'center' })

  // 연속 공부: 불꽃 + n일.
  const sx = x + w + gap
  text(ctx, webText.homeStudyStreakLabel, sx + 12, y - 6, { font: `700 11px ${sans}`, color: c.inkSoft })
  const value = t('studyStatsStreakValue', { count: recap.streakDays })
  const vf = `800 18px ${round}`
  const fw = 22 * 0.88
  const total = fw + 6 + measure(ctx, value, vf)
  const left = sx + (w - total) / 2
  drawFlame(ctx, left, y + 11, 22, recap.streakDays > 0)
  text(ctx, value, left + fw + 6, y + 29, { font: vf, color: c.ink })
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

/** 종이 위 아주 옅은 시계 무늬(섬 바탕 무늬를 종이 색으로). */
function paintPaperClocks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = 0.55
  paintClockField(ctx, w, h, c.paper, c.muted, true)
  ctx.restore()
}

/** 카드 아래 호수 띠: 물결 윗선, 작은 시계와 물결 무늬, 서비스 이름. */
function drawWaves(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const bump = 18
  ctx.fillStyle = c.lake
  ctx.beginPath()
  ctx.moveTo(x, y + 8)
  for (let bx = x; bx < x + w; bx += bump) {
    ctx.quadraticCurveTo(bx + bump / 2, y - 2, bx + bump, y + 8)
  }
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = c.lakePattern; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
  for (const [wx, wy] of [[x + 22, y + 30], [x + 120, y + 40], [x + 226, y + 28]] as const) {
    ctx.beginPath(); ctx.moveTo(wx, wy)
    ctx.quadraticCurveTo(wx + 8, wy - 6, wx + 16, wy); ctx.quadraticCurveTo(wx + 24, wy + 6, wx + 32, wy); ctx.stroke()
  }
  ctx.lineWidth = 2
  for (const [kx, ky] of [[x + 86, y + 26], [x + 190, y + 38]] as const) {
    ctx.beginPath(); ctx.arc(kx, ky, 6, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx, ky - 3.5); ctx.moveTo(kx, ky); ctx.lineTo(kx + 3, ky + 1); ctx.stroke()
  }
  text(ctx, webText.recapBrand, x + w - 20, y + 38, { font: `800 15px ${round}`, color: c.white, align: 'right' })
}

// ── 글자 도우미 ──

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, o: { font: string; color: string; align?: CanvasTextAlign }) {
  ctx.save()
  ctx.font = o.font
  ctx.fillStyle = o.color
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(value, x, y)
  ctx.restore()
}

function measure(ctx: CanvasRenderingContext2D, value: string, font: string): number {
  ctx.save(); ctx.font = font
  const w = ctx.measureText(value).width
  ctx.restore()
  return w
}

/** 한 줄에 들어가도록 글자 크기를 줄인다. */
function fitSize(ctx: CanvasRenderingContext2D, value: string, max: number, width: number): number {
  let size = max
  while (size > 24 && measure(ctx, value, `800 ${size}px ${round}`) > width) size -= 2
  return size
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
