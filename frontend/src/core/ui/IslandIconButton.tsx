import { useState } from 'react'
import type { Icon } from '@tabler/icons-react'
import s from './island.module.css'

/**
 * 원본: StudyRoomIslandIconButton. 장난감 단추처럼 턱 위에 얹힌 크림 종이 얼굴.
 * 누르면 얼굴이 턱으로 내려앉는다(턱 5 → 1.5). 턱까지 합친 높이가 size.
 */
export function IslandIconButton(props: {
  icon: Icon
  label: string
  onClick?: () => void
  active?: boolean
  size?: number
  iconSize?: number
  emphasis?: string
  className?: string
}) {
  const [pressed, setPressed] = useState(false)
  const size = props.size ?? 48
  const ledge = 5
  const face = size - ledge
  const enabled = props.onClick != null
  const active = !!props.active && enabled
  const emphasis = enabled ? props.emphasis : undefined
  const drop = pressed ? ledge - 1.5 : 0
  const faceColor = emphasis ?? (active ? 'var(--i-sun)' : 'var(--i-paper)')
  const ledgeColor = emphasis ? `color-mix(in srgb, ${emphasis} 78%, black)` : active ? 'var(--i-sun-ledge)' : 'var(--i-paper-ledge)'
  const ink = !enabled ? 'var(--i-ink-soft)' : emphasis ? '#fff' : active ? 'var(--i-on-sun)' : 'var(--i-ink)'
  const IconC = props.icon
  return (
    <button
      type="button"
      className={`${s.roundButton} ${props.className ?? ''}`}
      style={{ width: face, height: size }}
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.active ?? undefined}
      disabled={!enabled}
      onPointerDown={() => enabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={props.onClick}
    >
      <span className={s.roundShadow} style={{ width: face, height: face, top: ledge + 3 }} />
      <span className={s.roundLedge} style={{ width: face, height: face, top: ledge, background: ledgeColor }} />
      <span className={s.roundFace} style={{ width: face, height: face, transform: `translateY(${drop}px)`, background: faceColor, color: ink }}>
        <IconC size={props.iconSize ?? 22} stroke={2} />
      </span>
    </button>
  )
}
