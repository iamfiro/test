// 방 실시간 상태를 그리는 조각: 머리 위 이름·시간 칩(앱 StudySeatTag), 방 안 실시간 순위 시트(앱
// study_live_ranking_sheet.dart _LiveBoard: 시상대 + 4위부터 줄), 프로필 시트의 이번 세션·지금 방 순위 칸(앱
// study_member_sheet.dart _MemberStats). 순위는 서버 rank 그대로, 시간은 공부 중일 때만 as_of부터 1초마다 더해 그린다.
import { useEffect, useState } from 'react'
import { IconClockHour4, IconTrophy, IconX } from '@tabler/icons-react'
import { PaperSheet } from '../../../core/ui/PaperSheet'
import { IslandSurface } from '../../../core/ui/IslandSurface'
import { t } from '../../../l10n/t'
import { formatStudyClock } from '../home/studyFormat'
import type { LiveMember } from './liveProtocol'
import { liveSessionSeconds, rankedMembers, useRoomLive } from './roomLiveStore'
import s from './live.module.css'

/** 1초마다 바뀌는 지금 시각. active가 꺼져 있으면 멈춘다(흐르는 사람이 없을 때). */
export function useNowTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

/** 앱 studyPresence* 이름. */
export function liveStatusLabel(m: LiveMember): string {
  switch (m.status) {
    case 'studying': return t('studyPresenceFocusing')
    case 'paused': return t('studyPresenceResting')
    case 'away': return t('studyPresenceAway')
  }
}

/**
 * 원본 StudySeatTag: 흰 글자(그림자) 이름 10/600 위, 시간 12/800 아래. 공부 중이면 이번 세션 시계, 쉬는 중이면
 * "쉬는 중"(이름표 전체를 흐리게), 자리 비움이면 이름만(원본 caption null). 누르기는 받지 않는다(3D 뷰가 판정).
 */
export function SeatTag(props: { member: LiveMember; me: boolean; clockOffsetMs: number }) {
  const { member } = props
  const now = useNowTicker(member.status === 'studying')
  const caption = member.status === 'studying'
    ? formatStudyClock(liveSessionSeconds(member, now, props.clockOffsetMs))
    : member.status === 'paused' ? t('studyPresenceResting') : null
  const name = props.me ? t('studyMe') : member.nickname
  return (
    <div className={member.status === 'paused' ? `${s.tag} ${s.tagResting}` : s.tag} role="img" aria-label={t('studyParticipantSemantics', { nickname: name, status: liveStatusLabel(member) })}>
      <span className={s.tagName}>{name}</span>
      {caption != null && <span className={s.tagCaption}>{caption}</span>}
    </div>
  )
}

/** 원본 _MemberStats: 이번 세션(시작 전이면 "시작 전")·지금 방 순위("n위 · m명 중"). 둘 다 서버 값. */
export function MemberLiveStats(props: { userId: string }) {
  const live = useRoomLive()
  const member = live.members.find((m) => m.user_id === props.userId) ?? null
  const now = useNowTicker(member?.status === 'studying')
  const seconds = member ? liveSessionSeconds(member, now, live.clockOffsetMs) : 0
  const ranked = rankedMembers(live.members).length
  return (
    <div className={s.stats}>
      <StatCard icon={<IconClockHour4 size={16} aria-hidden="true" />} label={t('studyMemberSession')} value={seconds > 0 ? formatStudyClock(seconds) : t('studyMemberNotStarted')} />
      <StatCard
        icon={<IconTrophy size={16} aria-hidden="true" />}
        label={t('studyMemberRank')}
        value={member?.rank != null ? t('studyMemberRankValue', { rank: member.rank, total: ranked }) : t('studyMemberNotStarted')}
      />
    </div>
  )
}

function StatCard(props: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <IslandSurface radius={18} ledge={4} color="var(--i-muted)" ledgeColor="var(--i-paper-ledge)" className={s.statCard}>
      <div className={s.statBody}>
        <span className={s.statLabel}>{props.icon}<span>{props.label}</span></span>
        <span className={s.statValue}>{props.value}</span>
      </div>
    </IslandSurface>
  )
}

/** 받침 높이(1·2·3위, 앱 StudyRoomIslandPodium 100·76·58). */
const podiumHeights = [100, 76, 58]

/** 방 안 실시간 순위 시트(앱 _LiveBoard). 제목·닫기 머리, 비었으면 안내, 아니면 시상대 + 4위부터 줄. */
export function LiveRankingSheet(props: { myId: string; onDismiss: () => void }) {
  const live = useRoomLive()
  const ranked = rankedMembers(live.members)
  const now = useNowTicker(ranked.some((m) => m.status === 'studying'))
  const time = (m: LiveMember) => formatStudyClock(liveSessionSeconds(m, now, live.clockOffsetMs))
  const podium = ranked.slice(0, 3).filter((m) => m.rank! <= 3)
  const rest = ranked.filter((m) => !podium.includes(m))
  const name = (m: LiveMember) => (m.user_id === props.myId ? t('studyMe') : m.nickname)
  return (
    <PaperSheet label={t('studyLiveRankingTitle')} onDismiss={props.onDismiss}>
      <div className={s.board}>
        <header className={s.boardHead}>
          <h2 className={s.boardTitle}>{t('studyLiveRankingTitle')}</h2>
          <button type="button" className={s.close} aria-label="닫기" onClick={props.onDismiss}><IconX size={18} stroke={2.8} aria-hidden="true" /></button>
        </header>
        {ranked.length === 0 ? (
          <p className={s.boardEmpty}>{t('studyLiveRankingEmpty')}</p>
        ) : (
          <>
            <ol className={s.podium} aria-label={t('studyLiveRankingTitle')}>
              {[2, 1, 3].map((place) => {
                // 자리는 서버 순위 순서대로 1·2·3번 받침(같은 순위면 서버가 정한 순서), 받침 숫자는 서버 rank.
                const m = podium[place - 1]
                if (m == null) return <li key={place} className={s.podiumCol} aria-hidden="true" />
                return (
                  <li key={m.user_id} className={`${s.podiumCol} ${s[`place${place}`]}`} aria-label={t('studyRankingRow', { rank: m.rank!, nickname: name(m), duration: time(m) })}>
                    <span className={s.podiumWho}>
                      {place === 1 && <img className={s.podiumTrophy} src="/assets/icons/study_trophy.png" width={34} height={34} alt="" draggable={false} />}
                      <span className={m.user_id === props.myId ? `${s.podiumName} ${s.podiumMe}` : s.podiumName}>{name(m)}</span>
                      <span className={s.podiumTime}>{time(m)}</span>
                    </span>
                    <span className={s.block} style={{ '--h': `${podiumHeights[place - 1]}px` } as React.CSSProperties} aria-hidden="true">
                      <i className={s.blockTop} />
                      <b className={s.blockFront}>{m.rank}</b>
                    </span>
                  </li>
                )
              })}
            </ol>
            {rest.length > 0 && (
              <ol className={s.list}>
                {rest.map((m) => (
                  <li key={m.user_id} className={m.user_id === props.myId ? `${s.row} ${s.me}` : s.row} aria-label={t('studyRankingRow', { rank: m.rank!, nickname: name(m), duration: time(m) })}>
                    <span className={s.rank}>{m.rank}</span>
                    <span className={s.name}>{name(m)}</span>
                    <span className={s.time} aria-hidden="true">{time(m)}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </PaperSheet>
  )
}
