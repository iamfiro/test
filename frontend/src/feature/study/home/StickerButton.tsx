import { useEffect, useRef, type ReactNode } from 'react'
import { css, cubicAt, elasticOut, flutterCurves, sampled, useReducedMotion } from './motion'
import s from './StickerButton.module.css'

/** 음표 하나가 떠올라 사라지는 시간. 그동안 emitCount개가 차례로 나온다. */
const emitPeriodMs = 2400
const emitCount = 3
const swayMs = 1400
const popMs = 620

/**
 * 원본: StudyStickerButton. 스티커 그림 자체가 버튼인 공부 화면 단추(상점·음악·채팅).
 * 누르는 동안 0.82로 줄고(90ms easeOut), 떼면 용수철처럼 돌아온다(520ms elasticOut).
 * 누르면 한 번 좌우로 흔들린다(620ms). active면 emitAsset 음표가 오른쪽 위로 떠오르고,
 * emitAsset이 없으면 그림이 좌우로 흔들린다. 동작 줄이기에서는 움직이지 않는다.
 */
export function StickerButton(props: {
  asset: string
  label: string
  onClick?: () => void
  size?: number
  active?: boolean
  emitAsset?: string
}) {
  const size = props.size ?? 52
  const reduce = useReducedMotion()
  const scaleRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const pressed = useRef(false)
  const emitAsset = props.emitAsset
  const emitting = emitAsset != null
  const animating = !!props.active && !reduce

  // AnimatedScale: 지금 크기에서 새 목표로 다시 간다.
  const setPressed = (down: boolean) => {
    if (pressed.current === down) return
    pressed.current = down
    const el = scaleRef.current
    if (!el) return
    const current = getComputedStyle(el).transform
    const from = current === 'none' ? 1 : new DOMMatrixReadOnly(current).a
    for (const a of el.getAnimations()) a.cancel()
    const to = down ? 0.82 : 1
    if (reduce) {
      el.style.transform = `scale(${to})`
      return
    }
    el.style.transform = `scale(${to})`
    if (down) {
      el.animate([{ transform: `scale(${from})` }, { transform: `scale(${to})` }], { duration: 90, easing: css(flutterCurves.easeOut) })
    } else {
      el.animate(sampled(60, (t) => ({ transform: `scale(${from + (to - from) * elasticOut(t)})` })), { duration: 520 })
    }
  }

  const pop = () => {
    if (reduce) return
    popRef.current?.animate(
      sampled(48, (v) => ({ transform: `rotate(${Math.sin(v * Math.PI * 4) * 0.14 * (1 - v)}rad)` })),
      { duration: popMs },
    )
  }

  // 음표가 없는 스티커는 active인 동안 좌우로 살짝 흔들린다.
  useEffect(() => {
    const el = imageRef.current
    if (!el || emitting || !animating) return
    const a = el.animate(
      sampled(48, (v) => ({ transform: `rotate(${Math.sin(v * 2 * Math.PI) * 0.09}rad)` })),
      { duration: swayMs, iterations: Infinity },
    )
    return () => a.cancel()
  }, [emitting, animating])

  return (
    <button
      type="button"
      className={s.sticker}
      style={{ width: size, height: size }}
      aria-label={props.label}
      title={props.label}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => {
        pop()
        props.onClick?.()
      }}
    >
      <span ref={scaleRef} className={s.layer}>
        <span ref={popRef} className={s.layer}>
          <img ref={imageRef} className={s.image} src={props.asset} width={size} height={size} alt="" draggable={false} />
          {emitAsset != null && animating &&
            Array.from({ length: emitCount }, (_, i) => <Note key={i} index={i} size={size} asset={emitAsset} />)}
        </span>
      </span>
    </button>
  )
}

/**
 * 버튼 위쪽 가운데에서 나와 오른쪽 위로 살랑이며 떠오르고, 커졌다가 흐려지는 음표.
 * 음표마다 시작을 emitCount분의 1씩 어긋나게 해 끊이지 않고 나오게 한다.
 */
function Note(props: { index: number; size: number; asset: string }) {
  const ref = useRef<HTMLImageElement>(null)
  const { index, size } = props
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // 음표마다 비스듬한 각도를 조금씩 달리한다.
    const drift = (index - 1) * 0.12
    const a = el.animate(
      sampled(96, (t) => {
        const fade = t < 0.15 ? t / 0.15 : t > 0.6 ? (1 - t) / 0.4 : 1
        const left = size * (0.42 + 0.75 * t) + Math.sin(t * Math.PI * 2) * size * 0.06
        const top = size * (0.05 - (0.95 + drift) * t)
        const angle = -0.25 + Math.sin(t * Math.PI * 3) * 0.25
        const scale = 0.55 + 0.45 * cubicAt(flutterCurves.easeOut, t)
        return {
          opacity: Math.min(1, Math.max(0, fade)),
          transform: `translate(${left}px, ${top}px) rotate(${angle}rad) scale(${scale})`,
        }
      }),
      { duration: emitPeriodMs, iterations: Infinity, iterationStart: index / emitCount },
    )
    return () => a.cancel()
  }, [index, size])
  const note = size * 0.42
  return <img ref={ref} className={s.note} src={props.asset} width={note} height={note} alt="" draggable={false} />
}

/** 원본 `_stickerSlot`: 스티커(52)는 섬 버튼 칸(48)에 맞춰 놓고 넘치게 그린다. */
export function StickerSlot(props: { children: ReactNode }) {
  return <span className={s.slot}>{props.children}</span>
}
