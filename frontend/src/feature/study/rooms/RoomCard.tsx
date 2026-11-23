// 공부방 카드(밤하늘 페이지용 유리 카드). 정보 순서는 원본 StudyRoomIslandCard와 같다:
// 공부 중 표찰 → 로고 → 이름 → 소개 → 인원·방장. 배너가 없으면 방마다 고정된 성운 색을 쓴다(장식).
import type { CSSProperties } from 'react'
import { t } from '../../../l10n/t'
import type { Room } from './roomsStore'
import s from './rooms.module.css'

/** 방 id로 고정된 장식 색 두 개(같은 방은 늘 같은 색). */
const nebulae = [
  ['#5B7CFA', '#C17BFF'], ['#3FB6E8', '#5B6CF0'], ['#FF8AB4', '#8E7BFF'], ['#46D3A8', '#3A8DF0'],
  ['#FFB35C', '#FF6F91'], ['#7A6CFF', '#2FC4E8'], ['#F27DD2', '#6C8BFF'], ['#58C7F3', '#8BF0C0'],
] as const
function nebulaOf(id: string): readonly [string, string] {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0
  return nebulae[h % nebulae.length]!
}

export function RoomCard({ room, onOpen }: { room: Room; onOpen: (room: Room) => void }) {
  const [a, b] = nebulaOf(room.id)
  const top: CSSProperties = room.banner
    ? { backgroundImage: `url(${room.banner.url})` }
    : { backgroundImage: `radial-gradient(circle at 20% 30%, ${a}cc 0%, transparent 55%), radial-gradient(circle at 85% 70%, ${b}cc 0%, transparent 60%), linear-gradient(135deg, #1b2760, #2a1f5c)` }
  const fill = Math.min(100, Math.round((room.member_count / room.capacity) * 100))
  return (
    <button type="button" className={s.card} onClick={() => onOpen(room)} aria-label={room.name}>
      <div className={s.cardTop} style={top}>
        {room.studying_count > 0 && <span className={s.studying}>{t('studyRoomStudyingNow', { count: room.studying_count })}</span>}
      </div>
      <div className={s.logo} style={room.logo ? undefined : { background: `linear-gradient(135deg, ${a}, ${b})` }}>
        {room.logo ? <img src={room.logo.url} alt="" /> : <span aria-hidden="true">{[...room.name][0]}</span>}
      </div>
      <div className={s.cardBody}>
        <p className={s.name}>{room.name}</p>
        {room.description && <p className={s.description}>{room.description}</p>}
        <div className={s.footer}>
          <span className={s.meter} aria-hidden="true"><span style={{ width: `${fill}%` }} /></span>
          <span className={s.people}>{t('studyRoomPeople', { count: room.member_count, capacity: room.capacity })}</span>
          {room.is_host && <span className={s.host}>{t('studyRoomHost')}</span>}
        </div>
      </div>
    </button>
  )
}
