import { useNavigate } from 'react-router'
import { IconChevronLeft } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { IslandBackground } from '../../../core/ui/IslandBackground'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import { StudyTabBar, type StudyTab } from './StudyTabBar'
import { StudyRoomStage } from '../room3d/StudyRoomStage'
import s from './StudyHomePage.module.css'

const titles: Record<StudyTab, () => string> = {
  study: () => t('studyTabStudy'),
  rooms: () => t('studyRoomsTitle'),
  schedule: () => t('studyTabSchedule'),
  stats: () => t('studyTabStats'),
  outfit: () => t('studyTabOutfit'),
}
const paths: Record<StudyTab, string> = { study: '/', rooms: '/rooms', schedule: '/schedule', stats: '/stats', outfit: '/outfit' }

/** 원본: StudyHomePage. 탭 본문은 화면별로 채운다. */
export function StudyHomePage({ tab }: { tab: StudyTab }) {
  const navigate = useNavigate()
  return (
    <div className={s.page}>
      {tab === 'rooms' && <IslandBackground ground="grass" />}
      {tab === 'stats' && <IslandBackground ground="lake" />}
      {tab === 'schedule' && <IslandBackground colors={['#7FAF61', '#6F9F52']} />}
      {tab === 'outfit' && <div className={s.paper} />}
      {tab === 'study' && <div className={s.stage}><StudyRoomStage cameraMode="thirdPerson" topInset={68} /></div>}
      <header className={s.header}>
        <span className="palette-day"><IslandIconButton icon={IconChevronLeft} label="뒤로" onClick={() => navigate(-1)} /></span>
        <h1 className={s.title}>{titles[tab]()}</h1>
        <span className={s.side} />
      </header>
      <StudyTabBar current={tab} onSelect={(next) => navigate(paths[next])} />
    </div>
  )
}
