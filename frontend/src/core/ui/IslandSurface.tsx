import type { CSSProperties, ReactNode } from 'react'
import s from './island.module.css'

/** 원본: StudyRoomIslandSurface. 아래쪽에 두툼한 턱이 있는 크림색 종이 표면. */
export function IslandSurface(props: {
  children: ReactNode
  onClick?: () => void
  color?: string
  ledgeColor?: string
  /** 기본 AppRadius.card + 6 */
  radius?: number
  ledge?: number
  stadium?: boolean
  className?: string
  label?: string
  /** 고르기 단추(칩)면 골랐는지. */
  pressed?: boolean
}) {
  const ledge = props.ledge ?? 5
  const style = {
    '--face': props.color ?? 'var(--i-paper)',
    '--ledge-color': props.ledgeColor ?? 'var(--i-paper-ledge)',
    '--ledge': `${ledge}px`,
    '--radius': props.stadium ? '999px' : `${props.radius ?? 28 + 6}px`,
  } as CSSProperties
  const cls = `${s.surface} ${props.className ?? ''}`
  if (props.onClick) {
    return (
      <button type="button" className={`${cls} ${s.tappable}`} style={style} onClick={props.onClick} aria-label={props.label} aria-pressed={props.pressed}>
        {props.children}
      </button>
    )
  }
  return <div className={cls} style={style}>{props.children}</div>
}
