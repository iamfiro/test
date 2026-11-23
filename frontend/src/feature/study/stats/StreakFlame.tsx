// 연속 공부 불꽃(앱 StreakFlame의 정적 이식): 앱 강조색 점토 불꽃 한 덩이에 크림색 시계판 심지.
// 앱의 씨앗 불씨·바늘 회전은 웹에서 단순화해 몸통 눌림·늘어남만 남겼다(docs/design-parity/exceptions.md).
import s from './stats.module.css'

export function StreakFlame(props: { lit: boolean; size?: number }) {
  const size = props.size ?? 28
  const body = props.lit ? '#f26a2e' : '#d8d8dc'
  const shine = props.lit ? '#ff9a63' : '#e6e6ea'
  const face = props.lit ? '#fffaeb' : '#f2f2f4'
  const hand = props.lit ? '#5e4a32' : '#a9a9b0'
  return (
    <svg className={props.lit ? `${s.flame} ${s.flameLit}` : s.flame} width={size * 0.88} height={size} viewBox="0 0 44 50" aria-hidden="true">
      <path d="M22 49C10 49 3 41 3 31C3 21 10 17 14 8C15 5 17 3 19 2C19 7 22 9 26 6C30 3 31 1 31 1C32 6 36 8 38 14C41 22 41 26 41 31C41 41 34 49 22 49Z" fill={body} />
      <path d="M10 28C10 22 13 19 15 14" stroke={shine} strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <circle cx="22" cy="35" r="9" fill={face} />
      <path d="M22 35V29.5M22 35L26 37" stroke={hand} strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}
