// "오늘의 공부" 시트: 스토리에 올려 오늘 공부한 결과를 자랑하는 클립보드 프로필 시트 한 장.
// 구성은 사용자가 준 클립보드 프로필 레퍼런스(2026-11-23)를 따른다: 나무 판 + 금속 집게, 크림 종이, 제목 자리에 오늘
// 공부한 시간(가장 크게), 마스킹
// 테이프로 붙인 내 사진("나!" 화살표), 오른쪽 큰 항목(연속 공부·방 순위), 아래 큰 항목(이번 공부·공부일),
// 폴라로이드(오늘의 공부방), 티켓 스티커와 클립, 앱 스티커. 레퍼런스의 캐릭터·로고·문구는 쓰지 않는다.
// 이름·목표·과목은 넣지 않고 남은 항목을 크게 쓴다(사용자 결정 2026-11-23).
// 톤은 앱 공부 화면: 섬 팔레트 낮 값(tokens.css), 둥근 글꼴, 햇살 노랑 강조, 앱 스티커 아트(원본 PocketTime
// assets/icons/study_*.png). 클립보드·티켓·클립·테이프는 Codex로 그린 일러스트(public/assets/study_recap,
// 원본·프롬프트 tool/assets/recap_codex)이고, 글자·사진·스티커는 그 위에 캔버스로 그린다. 화면과 저장 이미지(인스타그램 스토리 1080×1920)는 같은 함수로 그린다.
// 다크 모드에서 저장해도 같은 이미지가 나오도록 값은 낮 팔레트로 고정한다.
import '@fontsource/gaegu/400.css'
import '@fontsource/gaegu/700.css'
import { paintClockField } from '../../../core/ui/IslandBackground'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { formatStudyDuration } from '../home/studyFormat'
import { flameShape } from '../stats/StreakFlame'
import type { StudyRecap } from './studyRecap'

/** 섬 팔레트 낮 값(tokens.css :root·.palette-day). */
const c = {
  muted: '#efe6d0',
  ink: '#5e4a32', inkSoft: '#9a8667', dash: '#d9c9a6',
  lake: '#609baf', lakePattern: '#528ba0', title: '#3e8da6',
  sun: '#f8d66a', sunLedge: '#d9b246', onSun: '#5e4a32',
  white: '#ffffff',
} as const

const fonts = {
  sans: '"Pretendard Variable", Pretendard, -apple-system, sans-serif',
  round: '"TmoneyRoundWind", "Pretendard Variable", sans-serif',
  /** 손글씨(Gaegu, OFL): 라벨·값·메모. */
  hand: '"Gaegu", "Pretendard Variable", sans-serif',
} as const

/** 시트(논리 pt) = 클립보드 일러스트(1200×1686)를 3분의 1로. 종이는 x 16–384, y 32–540, 집게는 y 59까지 내려온다. */
export const sheet = { width: 400, height: 562 } as const
/** 프로필 사진(정면)과 폴라로이드(전경) 크기. 3D 방은 이 비율로 찍는다. */
export const portraitSize = { width: 136, height: 148 } as const
export const sceneSize = { width: 98, height: 98 } as const

const stickerUrls = {
  trophy: '/assets/icons/study_trophy.png',
  camera: '/assets/icons/study_camera.png',
  clipboard: '/assets/study_recap/clipboard.webp',
  ticket: '/assets/study_recap/ticket.webp',
  paperclip: '/assets/study_recap/paperclip.webp',
  tape: '/assets/study_recap/tape.webp',
  arrow: '/assets/study_recap/doodle_arrow.webp',
  star: '/assets/study_recap/doodle_star.webp',
  note: '/assets/study_recap/doodle_note.webp',
  flower: '/assets/study_recap/doodle_flower.webp',
  sparkle: '/assets/study_recap/doodle_sparkle.webp',
} as const
export type CardAssets = Record<keyof typeof stickerUrls, HTMLImageElement>

/** 글꼴과 스티커 그림을 미리 읽는다(웹 글꼴은 처음 쓰일 때 내려받아 첫 그림에 빠질 수 있다). */
export async function loadCardAssets(recap: StudyRecap): Promise<CardAssets> {
  const sample = [
    webText.recapMe, webText.recapTimeSuffix, webText.recapScene, ...Object.values(webText.recapFields),
    formatStudyDuration(recap.todaySeconds), formatStudyDuration(recap.sessionSeconds), webText.recapBrand,
    '0123456789.·/!()시간분일등명월화수목금토일',
  ].join('')
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`sticker load failed: ${src}`))
    img.src = src
  })
  const keys = Object.keys(stickerUrls) as (keyof typeof stickerUrls)[]
  const [images] = await Promise.all([
    Promise.all(keys.map((k) => load(stickerUrls[k]))),
    document.fonts.load(`800 16px ${fonts.round}`, sample),
    document.fonts.load(`700 16px ${fonts.hand}`, sample),
    ...[600, 700, 800].map((w) => document.fonts.load(`${w} 16px ${fonts.sans}`, sample)),
  ] as const)
  return Object.fromEntries(keys.map((k, i) => [k, images[i]!])) as CardAssets
}

const weekdays = ['월', '화', '수', '목', '금', '토', '일']
function dateText(studyDate: string): string {
  const [y, m, d] = studyDate.split('-').map(Number) as [number, number, number]
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${weekdays[(new Date(y, m - 1, d).getDay() + 6) % 7]})`
}

// ── 시트 ──

export function drawSheet(ctx: CanvasRenderingContext2D, recap: StudyRecap, assets: CardAssets): void {
  // 규칙 셋(사용자 피드백 2026-11-24 "중구난방"): 글꼴은 숫자=둥근 글꼴, 라벨·메모=손글씨 둘만. 색은 데이터=잉크 갈색,
  // 손글씨·장식=청록(낙서의 반짝이만 햇살 노랑), 강조=숫자 밑 햇살 형광펜. 큰 장식은 뜻이 있는 것(테이프·티켓 클립·
  // 폴라로이드 카메라·화살표·순위 트로피)만, 자잘한 낙서는 정해 둔 빈자리에 작게. 위 칸(사진 + 연속·순위)과 아래 칸(이번 공부·공부일 + 폴라로이드)을 손그림 구분선으로 나눈다.
  ctx.drawImage(assets.clipboard, 0, 0, sheet.width, sheet.height)
  titleDuration(ctx, recap.todaySeconds, 152, 114, 244)
  drawTicket(ctx, assets, 334, 86)
  drawPortrait(ctx, recap, assets)
  drawTopRows(ctx, recap, assets)
  handDash(ctx, 32, 368, 336, 3)
  // 자잘한 손그림(사용자 요청 2026-11-24 "자잘한 표현은 남겨"): 청록·노랑 낙서만, 정해 둔 빈자리에 작게.
  doodle(ctx, assets.sparkle, 292, 134, 24, 0)
  doodle(ctx, assets.star, 356, 316, 18, 14)
  doodle(ctx, assets.note, 224, 356, 20, -10)
  doodle(ctx, assets.sparkle, 46, 520, 18, 0)
  drawBottomRows(ctx, recap, assets)
  drawPolaroid(ctx, recap, assets)
}

/** 티켓 스티커(일러스트) 위에 서비스 이름, 그 위에 꽂힌 클립. */
function drawTicket(ctx: CanvasRenderingContext2D, assets: CardAssets, cx: number, cy: number) {
  const w = 112
  const h = w * (220 / 420)
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((8 * Math.PI) / 180)
  ctx.shadowColor = 'rgba(90,55,20,0.22)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2
  ctx.drawImage(assets.ticket, -w / 2, -h / 2, w, h)
  ctx.shadowColor = 'transparent'
  text(ctx, 'STUDY', -w / 2 + w * 0.42, -4, { font: `800 9.5px ${fonts.round}`, color: c.ink, spacing: 0.8 })
  text(ctx, 'VILLAGE', -w / 2 + w * 0.42, 7, { font: `800 9.5px ${fonts.round}`, color: c.ink, spacing: 0.8 })
  ctx.restore()
  const pw = 18
  ctx.save()
  ctx.translate(cx + w / 2 - 14, cy - h / 2 - 4); ctx.rotate((12 * Math.PI) / 180)
  ctx.shadowColor = 'rgba(60,40,20,0.25)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5
  ctx.drawImage(assets.paperclip, -pw / 2, -pw * (360 / 160) / 2, pw, pw * (360 / 160))
  ctx.restore()
}

/** 프로필 사진: 흰 테두리, 마스킹 테이프, "나!" 화살표. */
function drawPortrait(ctx: CanvasRenderingContext2D, recap: StudyRecap, assets: CardAssets) {
  const fw = portraitSize.width + 12
  const fh = portraitSize.height + 12
  const cx = 34 + fw / 2
  const cy = 132 + fh / 2
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((-3 * Math.PI) / 180)
  ctx.save()
  ctx.shadowColor = 'rgba(90,55,20,0.25)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
  ctx.fillStyle = c.white
  ctx.fillRect(-fw / 2, -fh / 2, fw, fh)
  ctx.restore()
  photo(ctx, recap.photo, -portraitSize.width / 2, -portraitSize.height / 2, portraitSize.width, portraitSize.height)
  tape(ctx, assets, -fw / 2 + 10, -fh / 2 + 4, -38, 68)
  ctx.restore()
  // "나!"(손글씨)와 손그림 화살표: 사진 오른쪽 아래에서 사진을 가리킨다(위는 큰 공부 시간 자리).
  const by = cy + fh / 2
  ctx.save()
  ctx.translate(cx + 32, by + 6); ctx.scale(-1, -1)
  ctx.drawImage(assets.arrow, -13, -13, 26, 26)
  ctx.restore()
  text(ctx, webText.recapMe, cx + 46, by + 28, { font: `700 21px ${fonts.hand}`, color: c.title })
  doodle(ctx, assets.flower, cx + 80, by + 20, 16, 10)
}

type Row = { label: string; icon: HTMLImageElement; draw: (x: number, base: number, maxW: number) => void }

/** 큰 항목 한 묶음: 작은 낙서 + 손글씨 라벨(청록, 위) → 값(둥근 글꼴 크게, 아래) → 손으로 그은 점선. */
function rows(ctx: CanvasRenderingContext2D, list: Row[], x: number, right: number, startY: number, rowH: number) {
  list.forEach((r, i) => {
    const y = startY + i * rowH
    ctx.drawImage(r.icon, x - 1, y + 1, 16, 16)
    text(ctx, r.label, x + 18, y + 15, { font: `700 18px ${fonts.hand}`, color: c.title })
    const base = y + rowH - 16
    r.draw(x, base, right - x)
    handDash(ctx, x, right, base + 9, i * 7 + Math.round(startY))
  })
}

/** 손으로 그은 점선: 길이·높이가 조금씩 흔들리는 짧은 선. */
function handDash(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, seed: number) {
  let a = seed * 2654435761 >>> 0
  const rand = () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296 }
  ctx.save()
  ctx.strokeStyle = 'rgba(62,141,166,0.38)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'
  let x = x0
  while (x < x1) {
    const len = 5 + rand() * 3
    const end = Math.min(x1, x + len)
    ctx.beginPath(); ctx.moveTo(x, y + (rand() - 0.5) * 1.2); ctx.lineTo(end, y + (rand() - 0.5) * 1.2); ctx.stroke()
    x = end + 3.5 + rand() * 1.5
  }
  ctx.restore()
}

function drawTopRows(ctx: CanvasRenderingContext2D, recap: StudyRecap, assets: CardAssets) {
  const big = `800 28px ${fonts.round}`
  const list: Row[] = [
    { label: webText.recapFields.streak, icon: assets.star, draw: (x, b) => {
      flame(ctx, x, b - 25, 28, recap.streakDays > 0)
      highlight(ctx, t('studyStatsStreakValue', { count: recap.streakDays }), x + 30, b, big, recap.streakDays > 0 ? c.ink : c.inkSoft)
    } },
  ]
  if (recap.rank) {
    const rank = recap.rank
    list.push({ label: webText.recapFields.rank, icon: assets.flower, draw: (x, b) => {
      ctx.drawImage(assets.trophy, x - 2, b - 28, 30, 30)
      const num = `${rank.position}${webText.recapRankUnit}`
      highlight(ctx, num, x + 30, b, big)
      text(ctx, webText.recapRankTotal(rank.total), x + 30 + measure(ctx, num, big) + 6, b, { font: `700 17px ${fonts.hand}`, color: c.inkSoft })
    } })
  }
  rows(ctx, list, 200, 372, 132, 72)
}

function drawBottomRows(ctx: CanvasRenderingContext2D, recap: StudyRecap, assets: CardAssets) {
  const font = `800 24px ${fonts.round}`
  const list: Row[] = [
    { label: webText.recapFields.session, icon: assets.note, draw: (x, b) => highlight(ctx, formatStudyDuration(recap.sessionSeconds), x, b, font) },
    { label: webText.recapFields.date, icon: assets.sparkle, draw: (x, b, w) => text(ctx, ellipsize(ctx, dateText(recap.studyDate), font, w), x, b, { font, color: c.ink }) },
  ]
  rows(ctx, list, 32, 236, 356, 72)
}

/** 폴라로이드: 3인칭으로 본 오늘의 공부방, 아래 여백에 글씨, 카메라 스티커. */
function drawPolaroid(ctx: CanvasRenderingContext2D, recap: StudyRecap, assets: CardAssets) {
  const w = sceneSize.width + 14
  const h = sceneSize.height + 40
  const cx = 316
  const cy = 432
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((6 * Math.PI) / 180)
  ctx.save()
  ctx.shadowColor = 'rgba(90,55,20,0.28)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 4
  ctx.fillStyle = c.white
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.restore()
  photo(ctx, recap.scenePhoto, -sceneSize.width / 2, -h / 2 + 7, sceneSize.width, sceneSize.height)
  text(ctx, webText.recapScene, 0, h / 2 - 11, { font: `700 17px ${fonts.hand}`, color: c.title, align: 'center' })
  ctx.restore()
  sticker(ctx, assets.camera, cx + 46, cy - 62, 40, 14)
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
  // 시트: 폭에 맞춰 가운데, 살짝 기울여 그림자와 함께.
  const k = Math.min((W - 32) / sheet.width, (H - 170) / sheet.height)
  ctx.save()
  ctx.translate(W / 2, (H - 70) / 2 + 10); ctx.scale(k, k); ctx.rotate((-1.5 * Math.PI) / 180); ctx.translate(-sheet.width / 2, -sheet.height / 2)
  const base = layer(sheet.width, sheet.height, scale, (cc) => drawSheet(cc, recap, assets))
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.26)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 14
  ctx.drawImage(base, 0, 0, sheet.width, sheet.height)
  ctx.restore()
  ctx.restore()
  text(ctx, webText.recapBrand, W / 2, H - 34, { font: `800 15px ${fonts.round}`, color: c.white, align: 'center', shadow: true })
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

// ── 조각 도우미 ──

/** 사진을 칸에 꽉 채운다(가운데 기준 잘라 냄). 사진이 없으면 시계 무늬 칸. */
function photo(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement | null, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  if (img) {
    const s = Math.max(w / img.width, h / img.height)
    ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s)
  } else {
    ctx.translate(x, y); paintClockField(ctx, w, h, c.muted, c.dash, true)
  }
  ctx.restore()
}

/** 제목 자리 공부 시간: 숫자는 크게, 단위와 "공부"는 작게, 흰 테두리. 폭을 넘으면 함께 줄인다. */
function titleDuration(ctx: CanvasRenderingContext2D, seconds: number, mid: number, base: number, maxWidth: number) {
  // "6시간 25분 공부": 무슨 시간인지 보이게 끝에 작게 "공부"를 붙인다.
  const parts = [...(formatStudyDuration(seconds).match(/\d+|\D+/g) ?? []), ` ${webText.recapTimeSuffix}`]
  let big = 60
  const layout = () => parts.map((p) => {
    const digit = /\d/.test(p)
    const value = digit ? p : p.trim()
    return { value, font: digit ? `800 ${big}px ${fonts.round}` : `800 ${Math.round(big * 0.42)}px ${fonts.round}`, digit }
  }).map((it) => ({ ...it, width: measure(ctx, it.value, it.font) }))
  let items = layout()
  const gap = (i: number) => (i === 0 ? 0 : i === items.length - 1 ? 9 : items[i]!.digit ? 8 : 3)
  const total = () => items.reduce((sum, it, i) => sum + it.width + gap(i), 0)
  while (total() > maxWidth && big > 28) { big -= 2; items = layout() }
  let x = mid - total() / 2
  items.forEach((it, i) => {
    x += gap(i)
    ctx.save()
    ctx.font = it.font
    ctx.lineJoin = 'round'
    ctx.lineWidth = it.digit ? 7 : 5; ctx.strokeStyle = c.white
    ctx.strokeText(it.value, x, base)
    ctx.fillStyle = c.title
    ctx.fillText(it.value, x, base)
    ctx.restore()
    x += it.width
  })
}

/** 숫자에 햇살 형광펜을 긋고 쓴다. */
function highlight(ctx: CanvasRenderingContext2D, value: string, x: number, base: number, font: string, color: string = c.ink) {
  const w = measure(ctx, value, font)
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? 16)
  ctx.fillStyle = c.sun
  ctx.beginPath(); ctx.roundRect(x - 3, base - size * 0.42, w + 6, size * 0.48, size * 0.2); ctx.fill()
  text(ctx, value, x, base, { font, color })
}

function sticker(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, size: number, deg: number) {
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((deg * Math.PI) / 180)
  ctx.shadowColor = 'rgba(90,55,20,0.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3
  ctx.drawImage(img, -size / 2, -size / 2, size, size)
  ctx.restore()
}

/** 손그림 낙서를 기울여 얹는다(그림자 없음: 종이에 그린 것). */
function doodle(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, size: number, deg: number) {
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(img, -size / 2, -size / 2, size, size)
  ctx.restore()
}

/** 마스킹 테이프 일러스트를 기울여 붙인다. */
function tape(ctx: CanvasRenderingContext2D, assets: CardAssets, cx: number, cy: number, deg: number, w: number) {
  const h = w * (110 / 360)
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(assets.tape, -w / 2, -h / 2, w, h)
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
