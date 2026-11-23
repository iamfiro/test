// 화면 속 공부 인증 카드. passportDraw.ts의 같은 그리기 함수로 카드 본체와 소인 도장을 따로 그려 겹쳐 두고,
// 들어올 때 카드가 기울며 올라온 뒤 소인이 쾅 찍힌다. 마우스를 올리면 카드가 살짝 기운다.
import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react'
import { drawPassportBase, drawPostmark, passport, postmark } from './passportDraw'
import type { StudyRecap } from './studyRecap'
import s from './recap.module.css'

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

export function PassportArt({ recap, label }: { recap: StudyRecap; label: string }) {
  const tilt = useRef<HTMLDivElement>(null)
  // 마우스 기울임(정밀 포인터에서만, 움직임 줄이기 설정이면 끈다).
  const fine = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = tilt.current
    if (!el || !fine) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--tilt-x', `${(-y * 7).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${(x * 9).toFixed(2)}deg`)
    el.style.setProperty('--shine-x', `${((x + 0.5) * 100).toFixed(1)}%`)
  }
  const onLeave = () => {
    const el = tilt.current
    if (!el) return
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
  }
  return (
    <div className={s.art} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className={s.tilt} ref={tilt}>
        <div className={s.passport} style={{ width: passport.width, height: passport.height }}>
          <Layer width={passport.width} height={passport.height} draw={(ctx) => drawPassportBase(ctx, recap)} className={s.passportBase} />
          <Layer
            width={postmark.width}
            height={postmark.height}
            className={s.completionStamp}
            style={{ left: postmark.x - postmark.width / 2, top: postmark.y - postmark.height / 2, '--rot': `${postmark.rotate}deg`, '--delay': '820ms' } as CSSProperties}
            draw={(ctx) => { ctx.translate(postmark.width / 2, postmark.height / 2); drawPostmark(ctx, recap) }}
          />
          <span className={s.sheen} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
