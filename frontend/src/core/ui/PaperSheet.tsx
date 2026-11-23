import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import s from './PaperSheet.module.css'

/**
 * 공부 화면의 크림 종이 시트(앱 캡처: 과목 고르기·채팅). 양옆·아래 12 떨어진 카드, 모서리 32,
 * 안쪽 9에 점선 테두리(모서리 24). 화면 트리 안(포털)에 그려서 토스트·세션 문맥을 그대로 쓴다.
 * 늘 낮 섬 색(3D 방 위).
 */
export function PaperSheet(props: {
  label: string
  onDismiss: () => void
  children: ReactNode
  /** 고정 높이(예: 채팅). 없으면 내용 높이. */
  height?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const onDismiss = useRef(props.onDismiss)
  onDismiss.current = props.onDismiss
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true))
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss.current() }
    window.addEventListener('keydown', onKey)
    // 처음 열 때 카드에 초점을 둔다(안쪽 입력칸이 스스로 초점을 가져가면 그대로 둔다).
    if (!card.current?.contains(document.activeElement)) card.current?.focus({ preventScroll: true })
    return () => { cancelAnimationFrame(id); window.removeEventListener('keydown', onKey) }
  }, [])
  return createPortal(
    <div className={`${s.root} ${open ? s.open : ''} palette-day`}>
      <div className={s.barrier} onClick={props.onDismiss} />
      <div
        ref={card}
        className={`${s.card} ${props.className ?? ''}`}
        style={{ height: props.height } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={props.label}
        tabIndex={-1}
      >
        <svg className={s.dash} aria-hidden>
          <rect x="0" y="0" width="100%" height="100%" rx="24" ry="24" />
        </svg>
        <div className={s.content}>{props.children}</div>
      </div>
    </div>,
    document.body,
  )
}
