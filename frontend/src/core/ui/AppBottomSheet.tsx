import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import s from './AppBottomSheet.module.css'

/**
 * 원본: lib/shared/widgets/app_bottom_sheet.dart (floating). 양옆 12·아래 12(안전 영역) 떨어진 카드,
 * 모서리 32, 최대 폭 480, 배경 막 검정 35%, 손잡이 36×4, 제목 titleMedium 700·설명 bodyMedium 보조색.
 */
export function AppBottomSheet(props: { title?: string; description?: string; children?: ReactNode; contentPadding?: string; onDismiss: () => void; dark?: boolean }) {
  const [open, setOpen] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true))
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onDismiss() }
    window.addEventListener('keydown', onKey)
    card.current?.focus()
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', onKey) }
  }, [props])
  return (
    <div className={`${s.root} ${open ? s.open : ''} ${props.dark ? 'theme-dark' : ''}`}>
      <div className={s.barrier} onClick={props.onDismiss} />
      <div className={s.card} ref={card} role="dialog" aria-modal="true" aria-label={props.title} tabIndex={-1}>
        <div className={s.handle}><span /></div>
        {props.title && (
          <div className={s.header}>
            <h2 className={s.title}>{props.title}</h2>
            {props.description && <p className={s.description}>{props.description}</p>}
          </div>
        )}
        <div style={{ padding: props.contentPadding ?? '12px 24px 0' }}>{props.children}</div>
      </div>
    </div>
  )
}

/** 시트를 띄우고 닫힐 때 값을 돌려준다. 바깥을 누르거나 Esc면 null. */
export function showSheet<T>(render: (close: (value: T | null) => void) => ReactNode): Promise<T | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const close = (value: T | null) => {
      resolve(value)
      root.unmount()
      host.remove()
    }
    root.render(render(close))
  })
}
