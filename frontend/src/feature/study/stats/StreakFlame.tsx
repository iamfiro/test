// 연속 공부 불꽃(앱 StreakFlame의 정적 이식): 앱 강조색 점토 불꽃 한 덩이에 크림색 시계판 심지.
// 앱의 씨앗 불씨·바늘 회전은 웹에서 단순화해 몸통 눌림·늘어남만 남겼다(docs/design-parity/exceptions.md).
import s from './stats.module.css'

/** 불꽃 모양(viewBox 0 0 44 50). 요약 카드 캔버스도 같은 모양을 그린다. */
export const flameShape = {
  body: 'M22 49C10 49 3 41 3 31C3 21 10 17 14 8C15 5 17 3 19 2C19 7 22 9 26 6C30 3 31 1 31 1C32 6 36 8 38 14C41 22 41 26 41 31C41 41 34 49 22 49Z',
  shine: 'M10 28C10 22 13 19 15 14',
  hand: 'M22 35V29.5M22 35L26 37',
  lit: { body: '#f26a2e', shine: '#ff9a63', face: '#fffaeb', hand: '#5e4a32' },
  unlit: { body: '#d8d8dc', shine: '#e6e6ea', face: '#f2f2f4', hand: '#a9a9b0' },
} as const

export function StreakFlame(props: { lit: boolean; size?: number }) {
  const size = props.size ?? 28
  const { body, shine, face, hand } = props.lit ? flameShape.lit : flameShape.unlit
  return (
    <svg className={props.lit ? `${s.flame} ${s.flameLit}` : s.flame} width={size * 0.88} height={size} viewBox="0 0 44 50" aria-hidden="true">
      <path d={flameShape.body} fill={body} />
      <path d={flameShape.shine} stroke={shine} strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <circle cx="22" cy="35" r="9" fill={face} />
      <path d={flameShape.hand} stroke={hand} strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}
