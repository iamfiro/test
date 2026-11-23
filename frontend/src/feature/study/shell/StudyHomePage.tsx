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
import { RoomsPage } from '../rooms/RoomsPage'
import { SpaceBackground } from '../rooms/SpaceBackground'
import { useEffect, useState } from 'react'
import { useSubjectEditor } from '../subject/useSubjectEditor'
import { ChatSheet } from '../chat/ChatSheet'
import { chatStore, useChat } from '../chat/chatStore'
import s from './StudyHomePage.module.css'

/** 방이 없을 때의 채팅 토픽(원본 앱과 같다). 방 도메인(Phase 4)이 붙으면 `room:<id>`. */
const lobbyTopic = 'lobby'

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
  const subjects = useSubjectEditor({ onManage: () => navigate('/subjects') })
  const chat = useChat()
  const [chatOpen, setChatOpen] = useState(false)
  const myId = state.status === 'signedIn' ? state.me.id : null
  // 원본 `_chat != null`: 내 id가 정해지면 방(없으면 lobby) 채팅에 붙는다.
  useEffect(() => {
    if (myId == null) return
    chatStore.connect(lobbyTopic, myId)
    return () => chatStore.disconnect()
  }, [myId])
  return (
    <div className={s.page}>
      {tab === 'rooms' && <SpaceBackground />}
      {tab === 'rooms' && <RoomsPage />}
      {tab === 'stats' && <IslandBackground ground="lake" />}
      {tab === 'schedule' && <IslandBackground colors={['#7FAF61', '#6F9F52']} />}
      {tab === 'outfit' && <div className={s.paper} />}
      {tab === 'study' && <div className={s.stage}><StudyRoomStage cameraMode={camera.mode} topInset={68} /></div>}
      {/* 공부방: 넓은 화면에서도 뒤로 버튼은 창 왼쪽 위에 두고, 제목은 본문의 "모든 공부방"이 대신한다(사용자 결정 2026-11-23). */}
      <header className={tab === 'rooms' ? `${s.header} ${s.headerCorner}` : s.header}>
        <span className="palette-day"><IslandIconButton icon={IconChevronLeft} label="뒤로" onClick={() => navigate(-1)} /></span>
        {tab !== 'rooms' && <h1 className={s.title}>{titles[tab]()}</h1>}
        {tab !== 'rooms' && <span className={s.side} />}
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
          onPickSubject={subjects.openPicker}
          chatUnread={chat.unread}
          chatPeek={chat.peek == null ? null : { id: chat.peek.id, nickname: chat.peek.author.nickname, body: chat.peek.body }}
          onOpenChat={() => setChatOpen(true)}
        />
      )}
      {tab === 'study' && subjects.sheets}
      {tab === 'study' && chatOpen && myId != null && <ChatSheet myId={myId} onDismiss={() => setChatOpen(false)} />}
      <StudyTabBar current={tab} hidden={tab === 'study' && studyTabBarHidden({ timer: timer.view })} onSelect={(next) => navigate(paths[next])} />
    </div>
  )
}
