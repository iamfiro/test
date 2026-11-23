import type { ReactNode } from 'react'
import s from './AppButton.module.css'

/** 원본: lib/shared/widgets/app_button.dart. 강조색 버튼, 모서리 16, 큰 높이 56·중간 50, 17/700, 누르면 0.96. */
export function AppButton(props: {
  children: ReactNode
  onClick?: () => void
  large?: boolean
  background?: string
  foreground?: string
  loading?: boolean
  expand?: boolean
}) {
  const enabled = props.onClick != null
  return (
    <button
      type="button"
      className={s.button}
      disabled={!enabled || props.loading}
      aria-busy={props.loading || undefined}
      onClick={props.onClick}
      style={{
        minHeight: (props.large ?? true) ? 56 : 50,
        width: props.expand ? '100%' : undefined,
        background: enabled || props.loading ? (props.background ?? 'var(--c-accent)') : 'var(--c-inactive)',
        color: enabled || props.loading ? (props.foreground ?? '#fff') : 'var(--c-text-secondary)',
      }}
    >
      <span style={{ opacity: props.loading ? 0 : 1 }}>{props.children}</span>
      {props.loading && <span className={s.spinner} />}
    </button>
  )
}
