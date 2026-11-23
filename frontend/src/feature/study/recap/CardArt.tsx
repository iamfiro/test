// 화면 속 "오늘의 공부" 카드. cardDraw.ts의 같은 그리기 함수로 카드와 스티커를 따로 그려 겹쳐 두고,
// 들어올 때 카드가 기울며 올라온다.
// 홀로그램 포일(사용자 결정 2026-11-23, 레인보우 레어 카드 레퍼런스): 무지개 포일·빛 띠·반짝이·에칭 줄·빛 반사를
// CSS 레이어로 카드 얼굴 위에 겹치고, 포인터(없으면 천천히 도는 가상 빛)에 따라 카드가 기울며 포일이 흐른다.
import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react'
import { cardLayout, drawCardBase, drawPlates, type CardAssets, type CardLayout } from './cardDraw'
import type { StudyRecap } from './studyRecap'
import s from './recap.module.css'

/** 카드 무대 여백: 기울임·그림자 자리. */
export const stage = { left: 20, top: 20, right: 20, bottom: 24 } as const
export function stageSize(layout: CardLayout) {
  return { width: stage.left + layout.width + stage.right, height: stage.top + layout.height + stage.bottom }
}

/** 레이어 캔버스 화소 배율: 기울임·확대에도 또렷하게 기기 배율보다 조금 높게. */
const layerScale = () => Math.min(3.5, Math.max(2, window.devicePixelRatio || 1) * 1.5)

function Layer(props: { width: number; height: number; draw: (ctx: CanvasRenderingContext2D) => void; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { width, height, draw } = props
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const scale = layerScale()
    canvas.width = Math.ceil(width * scale)
    canvas.height = Math.ceil(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.imageSmoothingQuality = 'high'
    draw(ctx)
  }, [width, height, draw])
  return <canvas ref={ref} aria-hidden="true" className={props.className} style={{ width, height, ...props.style }} />
}

/** 반짝이 결 텍스처(한 번만 만든다): 흰 점·살짝 물든 점을 흩뿌린 256px 타일. */
let glitterUrl: string | null = null
function glitter(): string {
  if (glitterUrl) return glitterUrl
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  let a = 1234567
  const rand = () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296 }
  for (let i = 0; i < 1400; i++) {
    const r = rand() < 0.9 ? 0.5 + rand() * 0.6 : 1 + rand() * 1.2
    ctx.fillStyle = `hsla(${Math.floor(rand() * 360)}, 100%, ${85 + rand() * 15}%, ${0.35 + rand() * 0.65})`
    ctx.beginPath(); ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2); ctx.fill()
  }
  glitterUrl = canvas.toDataURL('image/png')
  return glitterUrl
}

export function CardArt({ recap, assets, label }: { recap: StudyRecap; assets: CardAssets; label: string }) {
  const tilt = useRef<HTMLDivElement>(null)
  const hovering = useRef(false)

  /** x·y는 0~1(카드 위 빛의 자리). 기울임과 포일 위치를 함께 바꾼다. */
  const apply = (x: number, y: number, tiltScale: number) => {
    const el = tilt.current
    if (!el) return
    el.style.setProperty('--tilt-x', `${((0.5 - y) * 10 * tiltScale).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${((x - 0.5) * 12 * tiltScale).toFixed(2)}deg`)
    el.style.setProperty('--px', `${(x * 100).toFixed(1)}%`)
    el.style.setProperty('--py', `${(y * 100).toFixed(1)}%`)
  }

  // 포인터가 없을 때(휴대폰·가만히 둘 때)는 빛이 천천히 8자로 돈다. 움직임 줄이기면 한 자리에 멈춘다.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(0.3, 0.3, 0); return }
    let raf = 0
    const started = performance.now()
    const loop = (now: number) => {
      if (!hovering.current) {
        const t = (now - started) / 1000
        apply(0.5 + 0.38 * Math.sin(t * 0.7), 0.5 + 0.28 * Math.sin(t * 1.1), 0.45)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = tilt.current
    if (!el) return
    hovering.current = true
    const r = el.getBoundingClientRect()
    apply(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), 1)
  }
  const onLeave = () => { hovering.current = false }
  const L = cardLayout(recap)
  const box = stageSize(L)
  return (
    <div className={s.art} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={onLeave} onPointerUp={onLeave} style={{ width: box.width, height: box.height }}>
      <div className={s.tilt} ref={tilt} style={{ left: stage.left, top: stage.top }}>
        <div className={s.card} style={{ width: L.width, height: L.height }}>
          <Layer width={L.width} height={L.height} draw={(ctx) => drawCardBase(ctx, recap)} className={s.cardBase} />
          <span className={s.foil} aria-hidden="true" style={{ '--glitter': `url(${glitter()})` } as CSSProperties}>
            {/* 테두리만: 진한 무지개와 반짝이(사진 칸은 비운다). */}
            <span className={s.frameFoil}>
              <span className={s.rainbow} />
              <span className={s.paperGlitter} />
            </span>
            {/* 강한 빛(빛 띠·반짝이·반사)은 사진 칸에만. */}
            <span className={s.photoFoil} style={{ left: L.photo.x, top: L.photo.y, width: L.photo.width, height: L.photo.height, borderRadius: L.photo.radius }}>
              <span className={`${s.rainbow} ${s.rainbowSoft}`} />
              <span className={s.shine} />
              <span className={s.glitter} />
              <span className={s.glare} />
            </span>
          </span>
          {/* 명판은 포일 위: 글자가 포일에 덮이지 않는다. */}
          <Layer width={L.width} height={L.height} draw={(ctx) => drawPlates(ctx, recap, assets)} className={s.plates} />
        </div>
      </div>
    </div>
  )
}
