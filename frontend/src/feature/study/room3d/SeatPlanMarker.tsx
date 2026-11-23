// 원본: room3d/widgets/study_seat_plan.dart (PocketTime f574f242).
// 자리 이동(카메라가 천장 위로 떠올라 맵 전체를 내려다볼 때) 자리 하나의 표시. 내 자리는 주황 동그라미,
// 빈자리는 누를 수 있는 점선 동그라미다. 다른 사람이 앉은 자리는 3D 사람이 보이므로 표시하지 않는다.
import { IconPlus, IconUser } from '@tabler/icons-react'
import { t } from '../../../l10n/t'

const mineColor = '#FF6427'
const paper = '#FFF8EC'

export function seatPlanMarker(p: { mapSeat: number; mine: number; taken: ReadonlySet<number>; pixelsPerMeter: number; onPick: (seat: number) => void }) {
  if (p.taken.has(p.mapSeat)) return null
  const size = Math.min(34, Math.max(22, p.pixelsPerMeter * 0.55))
  const number = p.mapSeat + 1
  const mine = p.mapSeat === p.mine
  // 누르는 자리는 표시보다 넉넉히(44).
  const touch = Math.max(44, size)
  const dot = (
    <svg width={size} height={size} viewBox="0 0 34 34" style={{ overflow: 'visible', filter: 'drop-shadow(0 1.5px 2px rgb(0 0 0 / 0.25))' }} aria-hidden="true">
      <circle cx="17" cy="17" r="16" fill={mine ? mineColor : `${paper}8C`} />
      <circle cx="17" cy="17" r="15" fill="none" stroke={mine ? '#fff' : paper} strokeWidth="2" strokeDasharray={mine ? undefined : `${(Math.PI * 30) / 24} ${(Math.PI * 30) / 24}`} />
    </svg>
  )
  const Icon = mine ? IconUser : IconPlus
  const inner = (
    <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: size, height: size }}>
      {dot}
      <Icon size={size * 0.5} stroke={2.4} color={mine ? '#fff' : '#6B4A33'} style={{ position: 'absolute' }} />
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
