// 공부방 카드(섬 스타일). 원본 StudyRoomIslandCard의 정보 순서(공부 중 표찰 → 로고 → 이름 → 소개 →
// 인원·방장)를 2열 격자에 맞게 줄였다.
import { t } from '../../../l10n/t'
import { IslandSurface } from '../../../core/ui/IslandSurface'
import type { Room } from './roomsStore'
import s from './rooms.module.css'

export function RoomCard({ room, onOpen }: { room: Room; onOpen: (room: Room) => void }) {
  return (
    <IslandSurface onClick={() => onOpen(room)} label={room.name} radius={26} className={s.card}>
      <div className={s.cardTop} style={room.banner ? { backgroundImage: `url(${room.banner.url})` } : undefined}>
        {room.studying_count > 0 && <span className={s.studying}>{t('studyRoomStudyingNow', { count: room.studying_count })}</span>}
      </div>
      <div className={s.logo}>{room.logo && <img src={room.logo.url} alt="" />}</div>
      <div className={s.cardBody}>
        <p className={s.name}>{room.name}</p>
        {room.description && <p className={s.description}>{room.description}</p>}
        <div className={s.footer}>
          <span className={s.people}>{t('studyRoomPeople', { count: room.member_count, capacity: room.capacity })}</span>
          {room.is_host && <span className={s.host}>{t('studyRoomHost')}</span>}
        </div>
      </div>
    </IslandSurface>
  )
}
