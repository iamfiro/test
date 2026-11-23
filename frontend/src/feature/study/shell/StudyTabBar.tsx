import { useRef } from 'react'
import { t } from '../../../l10n/t'
import s from './StudyTabBar.module.css'

/** 원본: StudyTabBar. 순서가 곧 탭바 순서다. */
export const studyTabs = ['study', 'rooms', 'schedule', 'stats', 'outfit'] as const
export type StudyTab = (typeof studyTabs)[number]

const labels: Record<StudyTab, () => string> = {
  study: () => t('studyTabStudy'),
  rooms: () => t('studyRoomsTitle'),
  schedule: () => t('studyTabSchedule'),
  stats: () => t('studyTabStats'),
  outfit: () => t('studyTabOutfit'),
}

/** 탭바 바탕은 지금 페이지 바탕과 맞춘다(원본 `_tabSurface`). */
export const tabSurface: Record<StudyTab, string> = {
  study: '#FFFAEB',
  rooms: 'var(--i-grass)',
  schedule: 'var(--tab-schedule)',
  stats: 'var(--i-lake)',
  outfit: 'var(--i-paper)',
}

/** 밝은 바탕이면 진한 글자. 원본은 surface.computeLuminance() > 0.5. */
const onLight: Record<StudyTab, boolean> = { study: true, rooms: false, schedule: false, stats: false, outfit: true }

export function StudyTabBar(props: { current: StudyTab; onSelect: (tab: StudyTab) => void; hidden?: boolean }) {
  return (
    <nav
      className={`${s.bar} ${props.hidden ? s.hidden : ''}`}
      style={{ background: tabSurface[props.current] }}
      aria-label={t('studyTabStudy')}
    >
      <div className={s.row}>
        {studyTabs.map((tab) => (
          <TabButton key={tab} tab={tab} selected={tab === props.current} onLight={onLight[props.current]} onSelect={props.onSelect} />
        ))}
      </div>
    </nav>
  )
}

function TabButton(props: { tab: StudyTab; selected: boolean; onLight: boolean; onSelect: (tab: StudyTab) => void }) {
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
      className={`${s.tab} ${props.selected ? (props.onLight ? s.selectedLight : s.selected) : ''}`}
      aria-current={props.selected ? 'page' : undefined}
      onClick={() => { wiggle(); props.onSelect(props.tab) }}
    >
      <span className={s.iconBox}>
        <img ref={icon} src={`/assets/icons/nav/study_tab_${props.tab}.png`} width={32} height={32} alt="" />
      </span>
      <span className={`${s.label} ${props.onLight ? s.labelDark : ''}`}>{labels[props.tab]()}</span>
    </button>
  )
}
