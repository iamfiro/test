// 공부방 페이지(사용자 스케치 2026-11-23): 왼쪽 큰 지구, 오른쪽 제목·검색 알약과 공부방 카드 2열.
// 앱 공부방 목록과 배치가 다르다(docs/design-parity/exceptions.md).
// 위에 "나와 같은 공부" 추천 칸(docs/plan/study-tags.md). 초기에는 방이 많아 보여야 하므로 추천은 거르기가 아니라
// 한 칸 더 보여 주는 것이고, 아래 모든 공부방에는 추천된 방도 그대로 있다.
import { useEffect, useRef, useState } from 'react'
import { IconSearch, IconTag, IconX } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { LoadFailed, StateView } from '../../../core/ui/StateView'
import { StudyGlobe } from './StudyGlobe'
import { RoomCard } from './RoomCard'
import { useRooms, type Room } from './roomsStore'
import { IslandButton } from '../../../core/ui/IslandButton'
import { IslandSurface } from '../../../core/ui/IslandSurface'
import { tagText } from '../../../l10n/web_tags_ko'
import { studySubjectColors } from '../timer/subjectPalette'
import { MyTagsSheet } from '../tags/MyTagsSheet'
import { loadMyTags, useMyTags } from '../tags/tagsStore'
import ts from '../tags/tags.module.css'
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
        {!q.trim() && <Recommended onOpenRoom={props.onOpenRoom} />}
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

/** 내 태그와 겹치는 방. 태그가 없으면 고르기 안내, 겹치는 방이 없으면 한 줄 안내(빈 상태 그림은 쓰지 않는다). */
function Recommended(props: { onOpenRoom?: (room: Room) => void }) {
  const { tags, revision } = useMyTags()
  const [editing, setEditing] = useState(false)
  useEffect(() => { void loadMyTags() }, [])
  const has = tags != null && tags.length > 0
  const { rooms } = useRooms('recommended', '', { enabled: has, revision })
  if (tags == null) return null
  const sheet = editing && <MyTagsSheet initial={tags} onDismiss={() => setEditing(false)} />
  if (!has) {
    return (
      <section className={ts.recSection}>
        <IslandSurface radius={26}>
          <div className={ts.prompt}>
            <ul className={ts.samples} aria-hidden="true">
              {tagText.myTagsSamples.map((name, i) => (
                <li key={name} className={ts.sample}>
                  <span className={ts.sampleDot} style={{ background: studySubjectColors[i % studySubjectColors.length]!.fill, borderColor: studySubjectColors[i % studySubjectColors.length]!.ink }} />
                  {name}
                </li>
              ))}
            </ul>
            <div className={ts.promptCopy}>
              <h2 className={ts.promptTitle}>{tagText.roomsRecommended}</h2>
              <p className={ts.promptText}>{tagText.myTagsPrompt}</p>
            </div>
            <IslandButton primary expand icon={IconTag} label={tagText.myTagsPick} minHeight={48} onClick={() => setEditing(true)} />
          </div>
        </IslandSurface>
        {sheet}
      </section>
    )
  }
  return (
    <section className={ts.recSection} aria-busy={!rooms || undefined}>
      <div className={ts.recHead}>
        <div className={ts.recTitleRow}>
          <h2 className={ts.recTitle}>{tagText.roomsRecommended}</h2>
          <div className={ts.recTags}>{tags.map((tag) => <span key={tag.id} className={ts.recTag}>#{tag.name}</span>)}</div>
        </div>
        <IslandButton label={tagText.myTagsEdit} minHeight={36} onClick={() => setEditing(true)} />
      </div>
      {rooms && rooms.length === 0 ? (
        <p className={ts.recEmpty}>{tagText.recommendedEmpty}</p>
      ) : (
        <div className={s.grid}>
          {(rooms ?? []).map((room) => <RoomCard key={room.id} room={room} onOpen={(r) => props.onOpenRoom?.(r)} />)}
        </div>
      )}
      {sheet}
    </section>
  )
}
