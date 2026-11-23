import s from './badges.module.css'

/** 원본 StudyStickerChip의 색. */
export const stickerChipColors = {
  red: { color: '#E0504A', ledge: '#B83A35', text: '#FFFFFF' },
  gold: { color: '#F5B731', ledge: '#D9932A', text: '#4A3410' },
} as const

/**
 * 원본: StudyStickerChip. 스티커 버튼 아래에 겹쳐 다는 작은 알약(상점 남은 시간·랭킹 등수).
 * 흰 테두리와 아래 턱으로 스티커처럼 보이게 한다.
 */
export function StickerChip(props: { label: string; semanticsLabel?: string; tone?: keyof typeof stickerChipColors }) {
  const tone = stickerChipColors[props.tone ?? 'red']
  return (
    <span
      className={s.chip}
      style={{ background: tone.color, boxShadow: `0 1.5px 0 ${tone.ledge}`, color: tone.text }}
    >
      <span aria-hidden>{props.label}</span>
      <span className="sr-only">{props.semanticsLabel ?? props.label}</span>
    </span>
  )
}

/** 원본: `_UnreadBadge`. 채팅 버튼 위 안 읽은 수(빨간 알약). 수는 버튼 이름이 읽는다. */
export function UnreadBadge(props: { count: number }) {
  return (
    <span className={s.unread} aria-hidden>
      {props.count > 99 ? '99+' : String(props.count)}
    </span>
  )
}
