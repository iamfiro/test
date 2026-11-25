import { useEffect, useRef, useState } from 'react'
import s from './LoadingCurtain.module.css'

const OPEN_MS = 640

/**
 * 동물의 숲 같은 로딩 가림막. `show`가 true인 동안 화면을 덮고, false가 되면 가운데에서 동그랗게 열리며 사라진다.
 * 3D 장면이 준비되기 전 빈 화면·깨진 첫 프레임을 사용자에게 보이지 않게 한다.
 */
export function LoadingCurtain(props: { show: boolean; fixed?: boolean; label?: string }) {
  const [mounted, setMounted] = useState(props.show)
  const [opening, setOpening] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(timer.current)
    if (props.show) { setMounted(true); setOpening(false); return }
    setOpening(true)
    timer.current = window.setTimeout(() => setMounted(false), OPEN_MS)
    return () => window.clearTimeout(timer.current)
  }, [props.show])
  if (!mounted) return null
  return (
    <div className={`${s.curtain} ${props.fixed ? s.fixed : ''} ${opening ? s.opening : ''}`} role="status" aria-live="polite" aria-label={props.label ?? '불러오는 중'}>
      <div className={s.paper} />
      <div className={s.center}>
        <img className={s.logo} src="/assets/brand/study_village.webp" alt="" draggable={false} />
        <div className={s.dots} aria-hidden="true"><i /><i /><i /></div>
      </div>
      <div className={s.hole} />
    </div>
  )
}
