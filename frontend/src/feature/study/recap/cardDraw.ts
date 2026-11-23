// "오늘의 공부" 시트: 스토리에 올려 오늘 공부한 결과를 자랑하는 클립보드 프로필 시트 한 장.
// 구성은 사용자가 준 클립보드 프로필 레퍼런스(2026-11-23)를 따른다: 나무 판 + 금속 집게, 크림 종이, 큰 제목, 마스킹
// 테이프로 붙인 내 사진("나!" 화살표), 오른쪽 큰 항목(공부 시간·연속 공부·방 순위), 아래 큰 항목(이번 공부·공부일),
// 폴라로이드(오늘의 공부방), 티켓 스티커와 클립, 앱 스티커. 레퍼런스의 캐릭터·로고·문구는 쓰지 않는다.
// 이름·목표·과목은 넣지 않고 남은 항목을 크게 쓴다(사용자 결정 2026-11-23).
// 톤은 앱 공부 화면: 섬 팔레트 낮 값(tokens.css), 둥근 글꼴, 햇살 노랑 강조, 앱 스티커 아트(원본 PocketTime
// assets/icons/study_*.png). 화면과 저장 이미지(인스타그램 스토리 1080×1920)는 같은 함수로 그린다.
// 다크 모드에서 저장해도 같은 이미지가 나오도록 값은 낮 팔레트로 고정한다.
import { paintClockField } from '../../../core/ui/IslandBackground'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { formatStudyDuration } from '../home/studyFormat'
import { flameShape } from '../stats/StreakFlame'
import type { StudyRecap } from './studyRecap'

/** 섬 팔레트 낮 값(tokens.css :root·.palette-day)과 판·집게 색. */
const c = {
  paper: '#fffaeb', paperLine: '#f3e9d2', muted: '#efe6d0',
  ink: '#5e4a32', inkSoft: '#9a8667', dash: '#d9c9a6',
  lake: '#609baf', lakePattern: '#528ba0', title: '#3e8da6',
  sun: '#f8d66a', sunLedge: '#d9b246', onSun: '#5e4a32',
  board: '#d8a46a', boardLedge: '#b5814a', boardEdge: '#e8bd86',
  metal: '#a4a7ad', metalDark: '#7d8087', metalLight: '#d3d5d9',
  tape: 'rgba(150,205,228,0.78)', white: '#ffffff',
} as const

const fonts = {
  sans: '"Pretendard Variable", Pretendard, -apple-system, sans-serif',
  round: '"TmoneyRoundWind", "Pretendard Variable", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const

/** 시트(논리 pt). 위 14는 집게가 판 위로 솟는 자리, 아래 8은 판 턱. */
const top = 14
const board = { width: 400, height: 540, radius: 24, ledge: 8 } as const
export const sheet = { width: board.width, height: top + board.height + board.ledge } as const
const paper = { x: 18, y: top + 32, width: board.width - 36, height: board.height - 50, radius: 14 } as const
/** 프로필 사진(정면)과 폴라로이드(전경) 크기. 3D 방은 이 비율로 찍는다. */
export const portraitSize = { width: 136, height: 148 } as const
export const sceneSize = { width: 98, height: 98 } as const

const stickerUrls = {
  trophy: '/assets/icons/study_trophy.png',
  focus: '/assets/icons/study_focus.png',
  music: '/assets/icons/study_music.png',
  camera: '/assets/icons/study_camera.png',
} as const
export type CardAssets = Record<keyof typeof stickerUrls, HTMLImageElement>

/** 글꼴과 스티커 그림을 미리 읽는다(웹 글꼴은 처음 쓰일 때 내려받아 첫 그림에 빠질 수 있다). */
export async function loadCardAssets(recap: StudyRecap): Promise<CardAssets> {
  const sample = [
    webText.recapSheetTitle, webText.recapSheetBrand, webText.recapMe, webText.recapScene, ...Object.values(webText.recapFields),
    formatStudyDuration(recap.todaySeconds), formatStudyDuration(recap.sessionSeconds), webText.recapBrand,
    '0123456789.·/!()시간분일등명월화수목금토일',
  ].join('')
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`sticker load failed: ${src}`))
    img.src = src
  })
  const [trophy, focus, music, camera] = await Promise.all([
    load(stickerUrls.trophy), load(stickerUrls.focus), load(stickerUrls.music), load(stickerUrls.camera),
    document.fonts.load(`800 16px ${fonts.round}`, sample),
    ...[600, 700, 800].map((w) => document.fonts.load(`${w} 16px ${fonts.sans}`, sample)),
  ] as const)
  return { trophy, focus, music, camera }
}

const weekdays = ['월', '화', '수', '목', '금', '토', '일']
function dateText(studyDate: string): string {
  const [y, m, d] = studyDate.split('-').map(Number) as [number, number, number]
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${weekdays[(new Date(y, m - 1, d).getDay() + 6) % 7]})`
}

// ── 시트 ──

export function drawSheet(ctx: CanvasRenderingContext2D, recap: StudyRecap, assets: CardAssets): void {
  drawBoard(ctx)
  drawPaper(ctx)
  drawClip(ctx)

  // 제목: 둥근 글꼴 호수 청록 + 흰 테두리, 아래 미세 글자.
  const tx = board.width / 2 - 40
  ctx.save()
  ctx.font = `800 30px ${fonts.round}`
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 6; ctx.strokeStyle = c.white
  ctx.strokeText(webText.recapSheetTitle, tx, top + 82)
  ctx.fillStyle = c.title
  ctx.fillText(webText.recapSheetTitle, tx, top + 82)
  ctx.restore()
  text(ctx, `${webText.recapSheetBrand} · ${dateText(recap.studyDate)}`, tx, top + 100, { font: `700 8.5px ${fonts.mono}`, color: c.inkSoft, align: 'center', spacing: 0.8 })

  drawTicket(ctx, recap, 322, top + 76)
  drawPortrait(ctx, recap)
  drawTopRows(ctx, recap)
  sticker(ctx, assets.music, 64, top + 340, 46, -14)
  if (recap.rank) sticker(ctx, assets.trophy, 178, top + 340, 42, 10)
  else sticker(ctx, assets.focus, 178, top + 342, 38, 10)
  drawBottomRows(ctx, recap)
  drawPolaroid(ctx, recap, assets)
}

function drawBoard(ctx: CanvasRenderingContext2D) {
  const y = top
  ctx.fillStyle = c.boardLedge
  ctx.beginPath(); ctx.roundRect(0, y + board.ledge, board.width, board.height, board.radius); ctx.fill()
  ctx.fillStyle = c.board
  ctx.beginPath(); ctx.roundRect(0, y, board.width, board.height, board.radius); ctx.fill()
  // 판 가장자리 밝은 선과 나뭇결 몇 줄.
  ctx.save()
  ctx.beginPath(); ctx.roundRect(0, y, board.width, board.height, board.radius); ctx.clip()
  ctx.strokeStyle = c.boardEdge; ctx.lineWidth = 3
  ctx.beginPath(); ctx.roundRect(4, y + 4, board.width - 8, board.height - 8, board.radius - 4); ctx.stroke()
  ctx.strokeStyle = 'rgba(150,100,55,0.18)'; ctx.lineWidth = 1
  for (let i = 0; i < 7; i++) {
    const gy = y + 60 + i * 74
    ctx.beginPath(); ctx.moveTo(0, gy)
    ctx.bezierCurveTo(120, gy - 6, 260, gy + 8, board.width, gy - 2); ctx.stroke()
  }
  ctx.restore()
}

function drawPaper(ctx: CanvasRenderingContext2D) {
  const { x, y, width: w, height: h, radius } = paper
  ctx.save()
  ctx.shadowColor = 'rgba(90,55,20,0.28)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
  ctx.fillStyle = c.paper
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill()
  ctx.restore()
  // 옅은 모눈.
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.clip()
  ctx.strokeStyle = c.paperLine; ctx.lineWidth = 0.8
  for (let gx = x + 18; gx < x + w; gx += 18) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke() }
  for (let gy = y + 18; gy < y + h; gy += 18) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke() }
  ctx.restore()
}

/** 금속 집게: 판에 붙은 받침 + 둥근 손잡이 + 리벳. 평평한 면 세 단으로 입체를 낸다. */
function drawClip(ctx: CanvasRenderingContext2D) {
  const cx = board.width / 2
  ctx.save()
  ctx.shadowColor = 'rgba(60,40,20,0.3)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3
  ctx.fillStyle = c.metalDark
  ctx.beginPath(); ctx.roundRect(cx - 74, top + 6, 148, 40, 10); ctx.fill()
  ctx.restore()
  ctx.fillStyle = c.metal
  ctx.beginPath(); ctx.roundRect(cx - 74, top + 4, 148, 36, 10); ctx.fill()
  // 손잡이(판 위로 솟음).
  ctx.fillStyle = c.metalDark
  ctx.beginPath(); ctx.roundRect(cx - 50, 2, 100, 24, 12); ctx.fill()
  ctx.fillStyle = c.metalLight
  ctx.beginPath(); ctx.roundRect(cx - 50, 0, 100, 21, 11); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.beginPath(); ctx.roundRect(cx - 40, 4, 80, 4, 2); ctx.fill()
  // 받침 위 밝은 띠와 리벳.
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath(); ctx.roundRect(cx - 66, top + 24, 132, 4, 2); ctx.fill()
  for (const rx of [cx - 60, cx + 60]) {
    ctx.fillStyle = c.metalDark; ctx.beginPath(); ctx.arc(rx, top + 30, 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = c.metalLight; ctx.beginPath(); ctx.arc(rx - 1, top + 29, 2, 0, Math.PI * 2); ctx.fill()
  }
}

/** 티켓 스티커(서비스 이름·바코드)와 그 위에 꽂힌 클립. */
function drawTicket(ctx: CanvasRenderingContext2D, recap: StudyRecap, cx: number, cy: number) {
  const w = 104
  const h = 50
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((8 * Math.PI) / 180)
  // 반달 홈은 같은 캔버스의 아래 그림을 지우지 않도록 따로 그린 티켓에서 판다.
  const m = ctx.getTransform()
  const scale = Math.hypot(m.a, m.b) || 1
  const ticket = document.createElement('canvas')
  ticket.width = Math.ceil(w * scale); ticket.height = Math.ceil(h * scale)
  const tc = ticket.getContext('2d')!
  tc.setTransform(scale, 0, 0, scale, 0, 0)
  tc.fillStyle = '#f6edd5'
  tc.beginPath(); tc.roundRect(0, 0, w, h, 6); tc.fill()
  tc.globalCompositeOperation = 'destination-out'
  for (const sx of [0, w]) { tc.beginPath(); tc.arc(sx, h / 2, 5, 0, Math.PI * 2); tc.fill() }
  ctx.save()
  ctx.shadowColor = 'rgba(90,55,20,0.22)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2
  ctx.drawImage(ticket, -w / 2, -h / 2, w, h)
  ctx.restore()
  ctx.strokeStyle = 'rgba(154,134,103,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2])
  ctx.beginPath(); ctx.roundRect(-w / 2 + 8, -h / 2 + 4, w - 16, h - 8, 4); ctx.stroke()
  ctx.setLineDash([])
  clockIcon(ctx, -w / 2 + 20, -2, 8, c.ink, 1.8)
  text(ctx, 'STUDY', -w / 2 + 33, -6, { font: `800 9px ${fonts.mono}`, color: c.ink, spacing: 0.6 })
  text(ctx, 'VILLAGE', -w / 2 + 33, 5, { font: `800 9px ${fonts.mono}`, color: c.ink, spacing: 0.6 })
  // 바코드: 기록 날짜 숫자로 굵기를 정한다.
  const digits = recap.studyDate.replace(/-/g, '')
  let bx = -w / 2 + 33
  for (let i = 0; i < 18 && bx < w / 2 - 12; i++) {
    const bw = 0.8 + (Number(digits[i % digits.length]) % 3) * 0.6
    ctx.fillStyle = c.ink
    ctx.fillRect(bx, 10, bw, 8)
    bx += bw + 1.4
  }
  ctx.restore()
  paperclip(ctx, cx + 40, cy - 26, 12)
}

/** 프로필 사진: 흰 테두리, 마스킹 테이프, "나!" 화살표. */
function drawPortrait(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const fw = portraitSize.width + 12
  const fh = portraitSize.height + 12
  const cx = 34 + fw / 2
  const cy = top + 122 + fh / 2
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((-3 * Math.PI) / 180)
  ctx.save()
  ctx.shadowColor = 'rgba(90,55,20,0.25)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3
  ctx.fillStyle = c.white
  ctx.fillRect(-fw / 2, -fh / 2, fw, fh)
  ctx.restore()
  photo(ctx, recap.photo, -portraitSize.width / 2, -portraitSize.height / 2, portraitSize.width, portraitSize.height)
  tape(ctx, -fw / 2 + 10, -fh / 2 + 4, -38, 64)
  ctx.restore()
  // "나!" 와 휜 화살표.
  text(ctx, webText.recapMe, cx + 40, top + 112, { font: `800 15px ${fonts.round}`, color: c.title })
  ctx.save()
  ctx.strokeStyle = c.title; ctx.lineWidth = 1.8; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(cx + 36, top + 108); ctx.quadraticCurveTo(cx + 18, top + 104, cx + 12, top + 124); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + 8, top + 118); ctx.lineTo(cx + 12, top + 125); ctx.lineTo(cx + 18, top + 120); ctx.stroke()
  ctx.restore()
}

type Row = { label: string; draw: (x: number, base: number, maxW: number) => void }

/** 큰 항목 한 묶음: 라벨(작게, 위) → 값(크게, 아래) → 점선 밑줄. */
function rows(ctx: CanvasRenderingContext2D, list: Row[], x: number, right: number, startY: number, rowH: number) {
  list.forEach((r, i) => {
    const y = startY + i * rowH
    text(ctx, r.label, x, y + 15, { font: `800 13px ${fonts.sans}`, color: c.inkSoft })
    const base = y + rowH - 16
    r.draw(x, base, right - x)
    ctx.save()
    ctx.strokeStyle = c.dash; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(x, base + 9); ctx.lineTo(right, base + 9); ctx.stroke()
    ctx.restore()
  })
}

function drawTopRows(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const big = `800 28px ${fonts.round}`
  const list: Row[] = [
    { label: webText.recapFields.time, draw: (x, b) => highlight(ctx, formatStudyDuration(recap.todaySeconds), x, b, big) },
    { label: webText.recapFields.streak, draw: (x, b) => {
      flame(ctx, x, b - 25, 28, recap.streakDays > 0)
      highlight(ctx, t('studyStatsStreakValue', { count: recap.streakDays }), x + 30, b, big, recap.streakDays > 0 ? c.ink : c.inkSoft)
    } },
  ]
  if (recap.rank) {
    const rank = recap.rank
    list.push({ label: webText.recapFields.rank, draw: (x, b) => {
      const num = `${rank.position}${webText.recapRankUnit}`
      highlight(ctx, num, x, b, big)
      text(ctx, webText.recapRankTotal(rank.total), x + measure(ctx, num, big) + 8, b, { font: `800 14px ${fonts.sans}`, color: c.inkSoft })
    } })
  }
  rows(ctx, list, 200, 372, top + 118, 64)
}

function drawBottomRows(ctx: CanvasRenderingContext2D, recap: StudyRecap) {
  const font = `800 22px ${fonts.round}`
  const list: Row[] = [
    { label: webText.recapFields.session, draw: (x, b) => highlight(ctx, formatStudyDuration(recap.sessionSeconds), x, b, font) },
    { label: webText.recapFields.date, draw: (x, b, w) => text(ctx, ellipsize(ctx, dateText(recap.studyDate), font, w), x, b, { font, color: c.ink }) },
  ]
  rows(ctx, list, 34, 250, top + 372, 62)
}

/** 폴라로이드: 3인칭으로 본 오늘의 공부방, 아래 여백에 글씨, 카메라 스티커. */
function drawPolaroid(ctx: CanvasRenderingContext2D, recap: StudyRecap, assets: CardAssets) {
  const w = sceneSize.width + 14
  const h = sceneSize.height + 40
  const cx = 318
  const cy = top + 440
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((6 * Math.PI) / 180)
  ctx.save()
  ctx.shadowColor = 'rgba(90,55,20,0.28)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 4
  ctx.fillStyle = c.white
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.restore()
  photo(ctx, recap.scenePhoto, -sceneSize.width / 2, -h / 2 + 7, sceneSize.width, sceneSize.height)
  text(ctx, webText.recapScene, 0, h / 2 - 12, { font: `800 11.5px ${fonts.round}`, color: c.inkSoft, align: 'center' })
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

function tape(ctx: CanvasRenderingContext2D, cx: number, cy: number, deg: number, w: number) {
  const h = 20
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate((deg * Math.PI) / 180)
  ctx.fillStyle = c.tape
  ctx.beginPath()
  ctx.moveTo(-w / 2, -h / 2)
  for (let i = 0; i <= 4; i++) ctx.lineTo(-w / 2 + (i % 2 ? 2.5 : 0), -h / 2 + (h * i) / 4)
  for (let i = 4; i >= 0; i--) ctx.lineTo(w / 2 - (i % 2 ? 2.5 : 0), -h / 2 + (h * i) / 4)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.fillRect(-w / 2 + 5, -h / 2 + 3, w - 10, 3)
  ctx.restore()
}

function paperclip(ctx: CanvasRenderingContext2D, x: number, y: number, deg: number) {
  ctx.save()
  ctx.translate(x, y); ctx.rotate((deg * Math.PI) / 180)
  const path = new Path2D('M3 34 V7 a4.5 4.5 0 0 1 9 0 V38 a6 6 0 0 1 -12 0 V11 a3 3 0 0 1 6 0 V33')
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(60,40,20,0.25)'; ctx.lineWidth = 2.6
  ctx.save(); ctx.translate(1, 1.4); ctx.stroke(path); ctx.restore()
  ctx.strokeStyle = c.metal; ctx.lineWidth = 2.2
  ctx.stroke(path)
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.8
  ctx.save(); ctx.translate(-0.5, -0.5); ctx.stroke(path); ctx.restore()
  ctx.restore()
}

function clockIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width: number) {
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.55); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.45, y + r * 0.2); ctx.stroke()
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
