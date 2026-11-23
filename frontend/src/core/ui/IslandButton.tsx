import type { ReactNode } from 'react'
import type { Icon } from '@tabler/icons-react'
import { IslandSurface } from './IslandSurface'
import s from './island.module.css'

/** 원본: StudyRoomIslandButton. 섬 스타일 알약 버튼. */
export function IslandButton(props: {
  label: string
  icon?: Icon
  leading?: ReactNode
  onClick?: () => void
  primary?: boolean
  expand?: boolean
  destructive?: boolean
  outlined?: boolean
  minHeight?: number
}) {
  const enabled = props.onClick != null
  const fg = !enabled
    ? 'var(--i-disabled-ink)'
    : props.primary ? 'var(--i-on-sun)' : props.destructive ? 'var(--i-danger)' : 'var(--i-ink)'
  const IconC = props.icon
  const content = (
    <span
      className={s.buttonContent}
      style={{ minHeight: props.minHeight ?? 40 + 4, color: fg, width: props.expand ? '100%' : undefined }}
    >
      {props.leading ? <span className={s.leading}>{props.leading}</span>
        : IconC ? <IconC size={17} stroke={2} className={s.leading} /> : null}
      <span className={s.buttonLabel}>{props.label}</span>
    </span>
  )
  if (props.outlined) {
    return (
      <button type="button" className={s.outlined} style={{ borderColor: `color-mix(in srgb, ${fg} 18%, transparent)`, width: props.expand ? '100%' : undefined }}
        disabled={!enabled} onClick={props.onClick}>
        {content}
      </button>
    )
  }
  return (
    <span className={props.expand ? s.expand : s.inline}>
      <IslandSurface
        stadium
        ledge={4}
        color={!enabled ? 'var(--i-disabled-face)' : props.primary ? 'var(--i-sun)' : 'var(--i-paper)'}
        ledgeColor={!enabled ? 'var(--i-disabled-ledge)' : props.primary ? 'var(--i-sun-ledge)' : 'var(--i-paper-ledge)'}
        onClick={enabled ? props.onClick : undefined}
        label={props.label}
      >
        {content}
      </IslandSurface>
    </span>
  )
}
