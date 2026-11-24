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
import { SoundPanel } from '../sound/SoundPanel'
import { useStudySound } from '../sound/useStudySound'
import { FocusClock, FocusControls, FocusStack } from '../home/focus'
import { useTimer } from '../timer/timerStore'
import { SpaceBackground } from '../rooms/SpaceBackground'
import { StudyStatsPage } from '../stats/StudyStatsPage'
import { useEffect, useRef, useState } from 'react'
import { useSubjectEditor } from '../subject/useSubjectEditor'
import { ChatSheet } from '../chat/ChatSheet'
import { StudyRecapModal } from '../recap/StudyRecapModal'
import { useRecapDemo } from '../recap/useRecapDemo'
import { chatStore, useChat } from '../chat/chatStore'
import { useOnboarding } from '../onboarding/useOnboarding'
import { MemberProfileSheet } from '../home/MemberProfileSheet'
import s from './StudyHomePage.module.css'

/** 방이 없을 때의 채팅 토픽(원본 앱과 같다). 방 도메인(Phase 4)이 붙으면 `room:<id>`. */
const lobbyTopic = 'lobby'

const titles: Record<StudyTab, () => string> = {
  study: () => t('studyTabStudy'),
  rooms: () => t('studyRoomsTitle'),
  schedule: () => t('studyTabSchedule'),
  stats: () => t('studyTabStats'),
}
const paths: Record<StudyTab, string> = { study: '/', rooms: '/rooms', schedule: '/schedule', stats: '/stats' }

/** 원본: StudyHomePage. 탭 본문은 화면별로 채운다. */
export function StudyHomePage({ tab }: { tab: StudyTab }) {
  const navigate = useNavigate()
  const { state } = useSession()
  // 원본 기본 시점(initialRoomCamera = thirdPerson). 누를 때마다 다음 시점, 이름은 1600ms.
  const camera = useStudyCameraCycle('thirdPerson')
  const timer = useStudyTimer(state.status === 'signedIn' ? state.me.profile.nickname : null)
  // 개발 전용: /?recap=goal|more|plain 으로 공부 인증 카드를 늘 띄워 본다(useRecapDemo).
  useRecapDemo(tab === 'study' && state.status === 'signedIn' ? state.me.profile.nickname : null, timer.showRecap)
  const subjects = useSubjectEditor({ onManage: () => navigate('/subjects') })
  const chat = useChat()
  const [chatOpen, setChatOpen] = useState(false)
  const [soundOpen, setSoundOpen] = useState(false)
  const [seatPlanOpen, setSeatPlanOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const sound = useStudySound(state.status === 'signedIn')
  useEffect(() => {
    if (!seatPlanOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSeatPlanOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seatPlanOpen])
  const focus = useFocusMode(tab === 'study', () => setSoundOpen(false))
  // 첫 가입 온보딩: 1–3단계·걸어 들어오는 동안은 공부 탭 UI를 숨기고 3D 연출과 온보딩 카드만 보인다.
  const onboarding = useOnboarding(tab === 'study')
  const bare = onboarding?.hidesStudyUi ?? false
  const wide = useMediaQuery('(min-width: 768px) and (min-height: 500px) and (orientation: landscape)')
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
      {tab === 'stats' && <StudyStatsPage />}
      {tab === 'schedule' && <IslandBackground colors={['#7FAF61', '#6F9F52']} />}
      {tab === 'study' && <div className={s.stage}><StudyRoomStage
            cameraMode={camera.mode}
            topInset={68}
            seatPlanOpen={seatPlanOpen}
            onCloseSeatPlan={() => setSeatPlanOpen(false)}
            cinematic={onboarding?.stage.cinematic ?? null}
            actorOverlay={onboarding?.stage.actorOverlay}
            seatChoices={onboarding?.stage.seatChoices ?? null}
            onSeat={onboarding?.stage.onSeat}
            // 지금 방에는 나(0번)만 앉아 있다. 다른 사람이 붙으면 그 사람 프로필을 연다.
            onPersonTap={bare || focus.on || seatPlanOpen ? undefined : (seat) => { if (seat === 0) setProfileOpen(true) }}
            focus={focus.on ? (wide ? { above: null, below: null } : {
              above: <FocusClock timer={timer.view} portrait={window.innerHeight >= window.innerWidth} />,
              below: <FocusControls timer={timer.view} size={80} onTogglePause={() => void timer.onTogglePause()} onFinish={() => void timer.onFinish()} />,
            }) : null}
          /></div>}
      {/* 뒤로 버튼은 공부 탭을 뺀 모든 탭에서 창 왼쪽 위의 흰 버튼(사용자 결정 2026-11-23). 공부 탭은 3D 방이
          전체라 버튼도 제목도 없다. 제목은 앱 폭 칸 가운데에 두고, 공부방은 본문의 "모든 공부방"이 대신한다. */}
      {/* 공부 탭 맨 위 가운데 로고(사용자 제공 이미지 2026-11-23). 3D 방 위에 떠 있어 누를 수 없다. */}
      {tab === 'study' && !bare && !focus.on && !seatPlanOpen && <img className={s.logo} src="/assets/brand/study_with_me.webp" alt="Study With Me" draggable={false} />}
      {/* 자리 이동 중에는 뒤로 버튼이 위에서 보기만 닫고 내 자리로 내려온다(원본 _studyBackButton). */}
      {tab === 'study' && seatPlanOpen && (
        <header className={`${s.header} ${s.headerCorner}`}>
          <span className="palette-day"><IslandIconButton icon={IconChevronLeft} label="뒤로" onClick={() => setSeatPlanOpen(false)} /></span>
        </header>
      )}
      {tab !== 'study' && (
        <header className={`${s.header} ${s.headerCorner}`}>
          <span className="palette-day"><IslandIconButton icon={IconChevronLeft} label="뒤로" onClick={() => navigate(paths.study)} /></span>
        </header>
      )}
      {tab !== 'study' && tab !== 'rooms' && (
        <header className={s.header}>
          <span className={s.side} />
          <h1 className={s.title}>{titles[tab]()}</h1>
          <span className={s.side} />
        </header>
      )}
      {tab === 'study' && !bare && (
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
          soundPanelOpen={soundOpen}
          focusMode={focus.on}
          seatPlanOpen={seatPlanOpen}
          onOpenSeatPlan={() => setSeatPlanOpen(true)}
          onSetFocusMode={focus.set}
          soundPlaying={sound.playing}
          onToggleSound={() => setSoundOpen((v) => !v)}
        />
      )}
      {tab === 'study' && <SoundPanel open={soundOpen} onClose={() => setSoundOpen(false)} />}
      {tab === 'study' && focus.on && wide && (
        <FocusStack timer={timer.view} onTogglePause={() => void timer.onTogglePause()} onFinish={() => void timer.onFinish()} />
      )}
      {tab === 'study' && subjects.sheets}
      {tab === 'study' && profileOpen && state.status === 'signedIn' && (
        <MemberProfileSheet profile={state.me.profile} mine onDismiss={() => setProfileOpen(false)} />
      )}
      {tab === 'study' && chatOpen && myId != null && <ChatSheet myId={myId} onDismiss={() => setChatOpen(false)} />}
      {timer.recap && <StudyRecapModal recap={timer.recap} onClose={timer.closeRecap} />}
      <StudyTabBar current={tab} hidden={tab === 'study' && (bare || studyTabBarHidden({ timer: timer.view, focusMode: focus.on, seatPlanOpen }))} onSelect={(next) => navigate(paths[next])} />
      {onboarding?.overlay}
    </div>
  )
}

/**
 * 집중 모드(원본 _setFocusMode·_closeFocusWhenEnded·_load): 켜면 사운드 패널을 닫고 화면이 꺼지지 않게
 * 하며, 남아 있던 세션을 처음 읽으면 바로 켠다. 켠 뒤 시작한 세션이 끝나면 저절로 나온다. Esc로 나온다.
 */
function useFocusMode(active: boolean, onEnter: () => void) {
  const [on, setOn] = useState(false)
  const { session, loaded } = useTimer()
  const hadSession = useRef(false)
  const restored = useRef(false)
  const set = (next: boolean) => {
    setOn(next)
    hadSession.current = next && session != null
    if (next) onEnter()
  }
  useEffect(() => {
    if (!loaded || restored.current) return
    restored.current = true
    if (session != null && active) set(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])
  useEffect(() => {
    if (!on) return
    if (session != null) { hadSession.current = true; return }
    if (hadSession.current) setOn(false)
  }, [on, session])
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOn(false) }
    window.addEventListener('keydown', onKey)
    // 원본 StudyScreenAwake: 집중하는 동안 화면을 켜 둔다(지원하는 브라우저에서만).
    let lock: { release(): Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }
    void nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {})
    return () => { window.removeEventListener('keydown', onKey); void lock?.release().catch(() => {}) }
  }, [on])
  return { on: on && active, set }
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}
