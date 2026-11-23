import { useRef } from 'react'
import { t } from '../../../l10n/t'
import s from './StudyTabBar.module.css'

/**
 * 원본: StudyTabBar. 순서가 곧 탭바 순서다.
 * 모양은 사용자 결정(2026-11-23)으로 앱과 다르다: 아래에서 위로 옅어지는 검정 그라데이션, 큰 아이콘(44),
 * 외곽선 없는 흰 둥근 글꼴 라벨, 고른 탭은 아이콘이 올라오고 커진다. docs/design-parity/exceptions.md 참고.
 */
export const studyTabs = ['study', 'rooms', 'schedule', 'stats'] as const
export type StudyTab = (typeof studyTabs)[number]

const labels: Record<StudyTab, () => string> = {
  study: () => t('studyTabStudy'),
  rooms: () => t('studyRoomsTitle'),
  schedule: () => t('studyTabSchedule'),
  stats: () => t('studyTabStats'),
}

/** 탭바 바탕은 지금 페이지 바탕과 맞춘다(원본 `_tabSurface`). */
export const tabSurface: Record<StudyTab, string> = {
  study: '#FFFAEB',
  rooms: 'var(--i-grass)',
  schedule: 'var(--tab-schedule)',
  stats: 'var(--i-lake)',
}

export function StudyTabBar(props: { current: StudyTab; onSelect: (tab: StudyTab) => void; hidden?: boolean }) {
  return (
    <nav
      className={`${s.bar} ${props.hidden ? s.hidden : ''}`}
      aria-label={t('studyTabStudy')}
    >
      <div className={s.row}>
        {studyTabs.map((tab) => (
          <TabButton key={tab} tab={tab} selected={tab === props.current} onSelect={props.onSelect} />
        ))}
      </div>
    </nav>
  )
}

function TabButton(props: { tab: StudyTab; selected: boolean; onSelect: (tab: StudyTab) => void }) {
  const icon = useRef<HTMLImageElement>(null)
  const wiggle = () => {
    // 감쇠하는 사인파로 450ms 흔들기(원본 _angle).
    icon.current?.animate(
      Array.from({ length: 19 }, (_, i) => {
        const x = i / 18
        return { transform: `rotate(${Math.sin(x * Math.PI * 4) * (1 - x) * 0.22}rad)` }
      }),
      { duration: 450 },
    )
  }
  return (
    <button
      type="button"
      className={`${s.tab} ${props.selected ? s.selected : ''}`}
      aria-current={props.selected ? 'page' : undefined}
      onClick={() => { wiggle(); props.onSelect(props.tab) }}
    >
      <span className={s.iconBox}>
        <img ref={icon} src={`/assets/icons/nav/study_tab_${props.tab}.png`} width={44} height={44} alt="" draggable={false} />
      </span>
      <span className={s.label}>{labels[props.tab]()}</span>
    </button>
  )
}
