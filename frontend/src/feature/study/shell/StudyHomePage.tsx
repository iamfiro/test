import { useNavigate } from 'react-router'
import { IconChevronLeft } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { IslandBackground } from '../../../core/ui/IslandBackground'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import { StudyTabBar, type StudyTab } from './StudyTabBar'
import { StudyRoomStage } from '../room3d/StudyRoomStage'
import { useSession } from '../../auth/session'
import { StudyTabOverlay, studyTabBarHidden } from '../home/StudyTabOverlay'
import { useStudyCameraCycle } from '../home/useStudyCameraCycle'
import { useStudyTimer } from '../timer/useStudyTimer'
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
  const { state } = useSession()
  // 원본 기본 시점(initialRoomCamera = thirdPerson). 누를 때마다 다음 시점, 이름은 1600ms.
  const camera = useStudyCameraCycle('thirdPerson')
  const timer = useStudyTimer(state.status === 'signedIn')
  return (
    <div className={s.page}>
      {tab === 'rooms' && <IslandBackground ground="grass" />}
      {tab === 'stats' && <IslandBackground ground="lake" />}
      {tab === 'schedule' && <IslandBackground colors={['#7FAF61', '#6F9F52']} />}
      {tab === 'outfit' && <div className={s.paper} />}
      {tab === 'study' && <div className={s.stage}><StudyRoomStage cameraMode={camera.mode} topInset={68} /></div>}
      <header className={s.header}>
        <span className="palette-day"><IslandIconButton icon={IconChevronLeft} label="뒤로" onClick={() => navigate(-1)} /></span>
        <h1 className={s.title}>{titles[tab]()}</h1>
        <span className={s.side} />
      </header>
      {tab === 'study' && (
        <StudyTabOverlay
          timer={timer.view}
          onStart={() => void timer.onTogglePause()}
          onTogglePause={() => void timer.onTogglePause()}
          onFinish={() => void timer.onFinish()}
          // StudyRoom3dView가 렌더 단계를 밖으로 알리지 않아 아직 알 수 없다(보고 참고).
          roomReady
          // 기준 화면(앱 캡처)은 코디 상점이 켜진 상태다. 웹 설정이 생기면 그 값으로 바꾼다.
          shopEnabled
          cameraMode={camera.mode}
          cameraHint={camera.hint}
          onCycleCamera={camera.cycle}
        />
      )}
      <StudyTabBar current={tab} hidden={tab === 'study' && studyTabBarHidden({ timer: timer.view })} onSelect={(next) => navigate(paths[next])} />
    </div>
  )
}
