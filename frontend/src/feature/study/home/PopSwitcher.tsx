import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { css, flutterCurves, reversed, useReducedMotion } from './motion'
import s from './bubbles.module.css'

type Entry = { key: string; node: ReactNode; leaving: boolean; animateIn: boolean }

/**
 * 원본 `_ChatPeek`·`_CameraHint`의 AnimatedSwitcher. 새 자식은 오른쪽 가운데를 기준으로
 * 커지며(easeOutBack) 나타나고, 나가는 자식은 작아지며(easeIn) 사라진다. 바뀌는 동안 둘을
 * 같은 자리에 겹친다(Stack alignment centerRight).
 */
export function PopSwitcher(props: {
  itemKey: string | null
  children: ReactNode
  inMs: number
  outMs: number
  /** SlideTransition 시작 위치(자식 폭 비율, 오른쪽으로). */
  slideFrom?: number
}) {
  const [entries, setEntries] = useState<Entry[]>(() =>
    // AnimatedSwitcher처럼 처음 자식은 애니메이션 없이 보인다.
    props.itemKey == null ? [] : [{ key: props.itemKey, node: props.children, leaving: false, animateIn: false }],
  )
  const [lastKey, setLastKey] = useState(props.itemKey)
  if (lastKey !== props.itemKey) {
    setLastKey(props.itemKey)
    const key = props.itemKey
    setEntries((prev) => [
      ...prev.filter((e) => e.key !== key).map((e) => ({ ...e, leaving: true })),
      ...(key == null ? [] : [{ key, node: props.children, leaving: false, animateIn: true }]),
    ])
  }
  return (
    <div className={s.switcher}>
      {entries.map((e) => (
        <SwitchEntry
          key={e.key}
          leaving={e.leaving}
          animateIn={e.animateIn}
          inMs={props.inMs}
          outMs={props.outMs}
          slideFrom={props.slideFrom ?? 0}
          onGone={() => setEntries((prev) => prev.filter((x) => !(x.key === e.key && x.leaving)))}
        >
          {e.leaving ? e.node : props.children}
        </SwitchEntry>
      ))}
    </div>
  )
}

function SwitchEntry(props: {
  leaving: boolean
  animateIn: boolean
  inMs: number
  outMs: number
  slideFrom: number
  onGone: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const frames = (v: number): Keyframe => ({
    opacity: v,
    transform: `scale(${v}) translateX(${props.slideFrom * (1 - v) * 100}%)`,
  })
  const enterMs = reduce ? 0 : props.inMs
  const exitMs = reduce ? 0 : props.outMs

  useLayoutEffect(() => {
    if (!props.animateIn || enterMs === 0) return
    ref.current?.animate([frames(0), frames(1)], { duration: enterMs, easing: css(flutterCurves.easeOutBack) })
    // 들어올 때 한 번만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onGone = useRef(props.onGone)
  onGone.current = props.onGone
  useLayoutEffect(() => {
    if (!props.leaving) return
    const el = ref.current
    if (!el || exitMs === 0) {
      onGone.current()
      return
    }
    for (const a of el.getAnimations()) a.cancel()
    const a = el.animate([frames(1), frames(0)], { duration: exitMs, easing: reversed(flutterCurves.easeIn), fill: 'forwards' })
    a.onfinish = () => onGone.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.leaving])

  return (
    <div ref={ref} className={s.entry} aria-hidden={props.leaving || undefined}>
      {props.children}
    </div>
  )
}
