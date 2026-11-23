// 공부방 페이지(사용자 스케치 2026-11-23): 왼쪽 큰 지구, 오른쪽 제목·검색 알약과 공부방 카드 2열.
// 앱 공부방 목록과 배치가 다르다(docs/design-parity/exceptions.md).
import { useRef, useState } from 'react'
import { IconSearch, IconX } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { LoadFailed, StateView } from '../../../core/ui/StateView'
import { StudyGlobe } from './StudyGlobe'
import { RoomCard } from './RoomCard'
import { useRooms, type Room } from './roomsStore'
import s from './rooms.module.css'

export function RoomsPage(props: { onOpenRoom?: (room: Room) => void }) {
  const [q, setQ] = useState('')
  const { rooms, failed, retry } = useRooms('all', q)
  const panel = useRef<HTMLElement>(null)
  // 지구 쪽(왼쪽)에서 휠을 돌려도 오른쪽 목록이 스크롤된다(사용자 요청 2026-11-23).
  const forwardWheel = (e: React.WheelEvent) => {
    const el = panel.current
    if (!el || el.contains(e.target as Node)) return
    el.scrollBy({ top: e.deltaY })
  }
  return (
    <div className={s.page} onWheel={forwardWheel}>
      <StudyGlobe className={s.globe} />
      <section ref={panel} className={s.panel}>
        <div className={s.head}>
          <h2 className={s.title}>{webText.roomsAll}</h2>
          <label className={s.search}>
            <IconSearch size={18} stroke={2.2} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={webText.roomSearchPlaceholder} aria-label={webText.roomSearchPlaceholder} maxLength={40} />
            {q && (
              <button type="button" className={s.clear} onClick={() => setQ('')} aria-label="지우기"><IconX size={16} stroke={2.4} /></button>
            )}
          </label>
        </div>
        {failed && !rooms ? (
          <LoadFailed onRetry={retry} />
        ) : rooms && rooms.length === 0 ? (
          <StateView illustration="empty_contacts" title={q ? webText.roomSearchEmpty : t('studyRoomEmptyMine')} />
        ) : (
          <div className={s.grid} aria-busy={!rooms}>
            {(rooms ?? []).map((room) => <RoomCard key={room.id} room={room} onOpen={(r) => props.onOpenRoom?.(r)} />)}
          </div>
        )}
      </section>
    </div>
  )
}
