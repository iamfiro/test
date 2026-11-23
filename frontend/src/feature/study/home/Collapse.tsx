import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { css, flutterCurves, reversed, useReducedMotion } from './motion'
import s from './MiniTimer.module.css'

const durationMs = 280

/**
 * 원본 `_StudyMiniTimer` 끝내기 단추의 AnimatedSwitcher(280ms, 들어올 때 easeOutCubic,
 * 나갈 때 easeInCubic): 가로로 펼쳐지며(SizeTransition, 시작 쪽 기준) 흐려졌다 커진다.
 */
export function Collapse(props: { show: boolean; children: ReactNode }) {
  const reduce = useReducedMotion()
  const [mounted, setMounted] = useState(props.show)
  const [lastShow, setLastShow] = useState(props.show)
  if (lastShow !== props.show) {
    setLastShow(props.show)
    if (props.show) setMounted(true)
  }
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const o = outer.current
    const i = inner.current
    if (!o || !i) {
      if (!props.show) setMounted(false)
      return
    }
    for (const a of [...o.getAnimations(), ...i.getAnimations()]) a.cancel()
    if (reduce) {
      if (!props.show) setMounted(false)
      return
    }
    const width = i.scrollWidth
    const from = props.show ? 0 : 1
    const to = props.show ? 1 : 0
    const easing = props.show ? css(flutterCurves.easeOutCubic) : reversed(flutterCurves.easeInCubic)
    const options: KeyframeAnimationOptions = { duration: durationMs, easing, fill: 'forwards' }
    const a = o.animate([{ width: `${width * from}px` }, { width: `${width * to}px` }], options)
    i.animate([{ opacity: from, transform: `scale(${from})` }, { opacity: to, transform: `scale(${to})` }], options)
    a.onfinish = () => {
      if (props.show) {
        for (const x of [...o.getAnimations(), ...i.getAnimations()]) x.cancel()
      } else {
        setMounted(false)
      }
    }
  }, [props.show, reduce])

  if (!mounted) return null
  return (
    <div ref={outer} className={s.collapse}>
      <div ref={inner} className={s.collapseInner}>{props.children}</div>
    </div>
  )
}
