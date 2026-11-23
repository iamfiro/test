// 원본: room3d/widgets/study_seat_plan.dart (PocketTime f574f242).
// 자리 이동(카메라가 천장 위로 떠올라 맵 전체를 내려다볼 때) 자리 하나의 표시. 내 자리는 주황 동그라미,
// 빈자리는 누를 수 있는 점선 동그라미다. 다른 사람이 앉은 자리는 3D 사람이 보이므로 표시하지 않는다.
// 웹: 밝은 바닥 위에서 빈자리가 안 보여서(사용자 피드백 2026-11-23) 불투명 크림 바탕·진한 갈색 점선·
// 짙은 그림자로 바꾸고 크기를 30–40으로 키웠다(원본 반투명 크림·크림 점선·22–34).
import { IconPlus, IconUser } from '@tabler/icons-react'
import { t } from '../../../l10n/t'

const mineColor = '#FF6427'
const paper = '#FFF8EC'
const ring = '#9A5B33'

export function seatPlanMarker(p: { mapSeat: number; mine: number; taken: ReadonlySet<number>; pixelsPerMeter: number; onPick: (seat: number) => void }) {
  if (p.taken.has(p.mapSeat)) return null
  const size = Math.min(40, Math.max(30, p.pixelsPerMeter * 0.65))
  const number = p.mapSeat + 1
  const mine = p.mapSeat === p.mine
  // 누르는 자리는 표시보다 넉넉히(44).
  const touch = Math.max(44, size)
  const dot = (
    <svg width={size} height={size} viewBox="0 0 34 34" style={{ overflow: 'visible', filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 0.4))' }} aria-hidden="true">
      <circle cx="17" cy="17" r="16" fill={mine ? mineColor : paper} />
      <circle cx="17" cy="17" r="14.6" fill="none" stroke={mine ? '#fff' : ring} strokeWidth={mine ? 2 : 2.6} strokeDasharray={mine ? undefined : `${(Math.PI * 29.2) / 24} ${(Math.PI * 29.2) / 24}`} strokeLinecap="round" />
    </svg>
  )
  const Icon = mine ? IconUser : IconPlus
  const inner = (
    <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: size, height: size }}>
      {dot}
      <Icon size={size * 0.5} stroke={2.8} color={mine ? '#fff' : ring} style={{ position: 'absolute' }} />
    </span>
  )
  const style = { width: touch, height: touch, display: 'grid', placeItems: 'center', padding: 0, border: 0, background: 'none' } as const
  if (mine) return <span style={style} role="img" aria-label={t('studySeatPlanMine', { seat: number })}>{inner}</span>
  return (
    <button type="button" style={{ ...style, cursor: 'pointer' }} aria-label={t('studySeatPlanFree', { seat: number })} onClick={() => p.onPick(p.mapSeat)}>
      {inner}
    </button>
  )
}
