// 모달 안의 여권 아트. passportDraw.ts의 같은 그리기 함수로 레이어를 하나씩 캔버스에 그려 겹쳐 두고,
// 들어올 때 여권이 미끄러져 오르고 → 과목 우표가 차례로 붙고 → 완료 도장이 찍힌다. 마우스를 올리면 살짝 기운다.
import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react'
import { completionStamp, drawCompletionStamp, drawPassportBase, drawSubjectStamp, passport, subjectSlots, subjectStamp } from './passportDraw'
import { passportStampSlots, type StudyRecap } from './studyRecap'
import s from './recap.module.css'

/** 레이어 캔버스 화소 배율: 기울임·확대에도 또렷하게 기기 배율보다 조금 높게. */
const layerScale = () => Math.min(3, Math.max(2, window.devicePixelRatio || 1) * 1.25)

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
  const stamps = recap.subjects.slice(0, passportStampSlots)

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
      <div className={s.backSheet} />
      <div className={s.tilt} ref={tilt}>
        <div className={s.passport} style={{ width: passport.width, height: passport.height }}>
          <Layer width={passport.width} height={passport.height} draw={(ctx) => drawPassportBase(ctx, recap)} className={s.passportBase} />
          {stamps.map((item, i) => {
            const slot = subjectSlots[i]!
            const w = subjectStamp.width + subjectStamp.margin * 2
            const h = subjectStamp.height + subjectStamp.margin * 2
            return (
              <Layer
                key={`${item.subject ?? ''}-${i}`}
                width={w}
                height={h}
                className={s.subjectStamp}
                style={{ left: slot.x - w / 2, top: slot.y - h / 2, '--rot': `${slot.rotate}deg`, '--delay': `${820 + i * 110}ms` } as CSSProperties}
                draw={(ctx) => { ctx.translate(w / 2, h / 2); drawSubjectStamp(ctx, item, i) }}
              />
            )
          })}
          {(() => {
            const size = completionStamp.radius * 2 + completionStamp.margin * 2
            return (
              <Layer
                width={size}
                height={size}
                className={s.completionStamp}
                style={{ left: completionStamp.x - size / 2, top: completionStamp.y - size / 2, '--rot': `${completionStamp.rotate}deg`, '--delay': `${1080 + stamps.length * 110}ms` } as CSSProperties}
                draw={(ctx) => { ctx.translate(size / 2, size / 2); drawCompletionStamp(ctx, recap) }}
              />
            )
          })()}
          <span className={s.sheen} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
