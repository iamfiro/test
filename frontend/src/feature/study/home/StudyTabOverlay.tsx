import type { CSSProperties } from 'react'
import { IconMinimize } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import type { StudyRoomCameraMode } from '../room3d/domain/seatCamera'
import { StickerButton } from './StickerButton'
import { StickerChip, UnreadBadge } from './badges'
import { CameraHint, ChatPeek, type ChatPeekMessage } from './bubbles'
import { SeatPlanHeader } from './focus'
import { MiniTimer } from './MiniTimer'
import { cameraLabel } from './studyFormat'
import type { StudyTimerView } from './studyTimerView'
import s from './StudyTabOverlay.module.css'

/** 오른쪽 위 스티커 단추 한 변(원본은 40~52). 큰 화면에서 작아 보여 키웠다(사용자 결정 2026-11-23). */
const railSize = 52
/** 카메라·자리 이동·집중 모드: 타이머 위 오른쪽 아래 줄(사용자 결정 2026-11-23). */
const bottomSize = 56
const icon = (name: string) => `/assets/icons/${name}`

export type StudyTabOverlayProps = {
  timer: StudyTimerView
  /** 원본 `_room3d.phase == StudyRoomRenderPhase.ready`. 시점·자리 이동 버튼 조건. */
  roomReady: boolean
  /** 원본 Remote Config `studyOutfitShopEnabled`. 상점 버튼과 랭킹 위치가 달라진다. */
  shopEnabled: boolean
  soundPanelOpen?: boolean
  focusMode?: boolean
  seatPlanOpen?: boolean

  cameraMode: StudyRoomCameraMode
  /** 방금 바꾼 시점(원본 `_cameraHint`, 1600ms 뒤 null). */
  cameraHint: StudyRoomCameraMode | null
  onCycleCamera?: () => void

  soundPlaying?: boolean
  onToggleSound?: () => void

  onOpenShop?: () => void
  /** 가장 먼저 끝나는 기간 판매까지 남은 시간 문구(원본 StudyShopCountdownPill). 없으면 알약을 그리지 않는다. */
  shopEndsIn?: string | null
  onOpenRanking?: () => void
  /** 이 방에서 내 등수(원본 studyMyLiveRank). 없으면 칩을 그리지 않는다. */
  myRank?: number | null

  chatUnread?: number
  chatPeek?: ChatPeekMessage | null
  onOpenChat?: () => void

  onStart?: () => void
  onTogglePause?: () => void
  onFinish?: () => void
  onPickSubject?: () => void
  onSetFocusMode?: (on: boolean) => void
  onOpenSeatPlan?: () => void
}

/** 원본 `_tabBarHidden`(공부 탭): 집중 모드이거나 공부(일시정지 포함) 중이거나 자리 이동 중. */
export function studyTabBarHidden(p: Pick<StudyTabOverlayProps, 'timer' | 'focusMode' | 'seatPlanOpen'>): boolean {
  return !!p.focusMode || p.timer.session !== 'none' || !!p.seatPlanOpen
}

/**
 * 원본 StudyHomePage의 공부 탭 Positioned 오버레이(818–1171행)와 `_room`의 미니 타이머.
 * 위치는 원본 계산식 그대로다(StudyTabOverlay.module.css 주석 참고). 3D 방 위라 늘 낮 섬 색.
 */
export function StudyTabOverlay(props: StudyTabOverlayProps) {
  const { timer } = props
  const soundOpen = !!props.soundPanelOpen
  const focusMode = !!props.focusMode
  const seatPlanOpen = !!props.seatPlanOpen
  const timerReady = timer.phase === 'ready' && timer.hasOwner
  const showsCameraButton = timerReady && props.roomReady
  const showsSeatMove = showsCameraButton && timer.session === 'none'
  const showsFocusButton = timerReady
  const showFocus = !soundOpen && timerReady
  // 원본은 효과음 패널·집중 모드·자리 이동 중에 이 버튼들을 모두 걷는다.
  const roomButtons = !soundOpen && !focusMode && !seatPlanOpen
  // 원본 `_chat != null`: 내 id가 정해지면 방(없으면 lobby) 채팅을 붙인다.
  const chatAvailable = timer.hasOwner
  const unread = props.chatUnread ?? 0
  const rank = props.myRank ?? null
  const timerVeiled = focusMode || seatPlanOpen
  const onSetFocusMode = props.onSetFocusMode

  return (
    <>
      {roomButtons && (
        <div className={`${s.rankingCorner} palette-day`}>
          <StickerButton asset={icon('study_trophy.png')} size={railSize} label={t('studyLiveRankingOpen')} onClick={props.onOpenRanking} />
          {rank != null && (
            <span className={s.chip}>
              <StickerChip
                label={t('studyLiveRankChip', { rank })}
                semanticsLabel={t('studyLiveRankChipLabel', { rank })}
                tone="gold"
              />
            </span>
          )}
        </div>
      )}
      <div className={`${s.rail} palette-day`}>
        {!seatPlanOpen && (
          <div className={s.railRow}>
            <StickerButton
              asset={icon('study_music.png')}
              emitAsset={icon('study_music_note.svg')}
              size={railSize}
              active={!!props.soundPlaying}
              label={props.soundPlaying ? t('studySoundPlayingLabel') : t('studySoundTitle')}
              onClick={props.onToggleSound}
            />
            {showFocus && focusMode && (
              <IslandIconButton
                icon={IconMinimize}
                label={t('studyFocusModeClose')}
                // 원본은 늘 누를 수 있는 단추다(비활성 모양 없음).
                onClick={() => onSetFocusMode?.(false)}
              />
            )}
          </div>
        )}
        {roomButtons && chatAvailable && (
          <div className={s.railRow}>
            <ChatPeek message={props.chatPeek ?? null} onOpen={props.onOpenChat} />
            <span className={s.railChat}>
              <StickerButton
                asset={icon('study_chat.png')}
                size={railSize}
                label={unread > 0 ? t('studyChatOpenUnread', { count: unread }) : t('studyChatOpen')}
                onClick={props.onOpenChat}
              />
              {unread > 0 && (
                <span className={s.unread}>
                  <UnreadBadge count={unread} />
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    <div
      className={`${s.overlay} palette-day`}
      style={{
      } as CSSProperties}
    >
      {roomButtons && (showsCameraButton || showsSeatMove || showsFocusButton) && (
        <div className={s.bottomButtons}>
          {showsCameraButton && (
            <>
              <CameraHint label={props.cameraHint == null ? null : cameraLabel(props.cameraHint)} />
              <StickerButton
                asset={icon('study_camera.png')}
                size={bottomSize}
                label={t('studyRoomCameraChange', { mode: cameraLabel(props.cameraMode) })}
                onClick={props.onCycleCamera}
              />
            </>
          )}
          {showsSeatMove && (
            <>
              {showsCameraButton && <span className={s.gapXl} />}
              <StickerButton asset={icon('study_seat.png')} size={bottomSize} label={t('studySeatMove')} onClick={props.onOpenSeatPlan} />
            </>
          )}
          {showsFocusButton && (
            <>
              {(showsCameraButton || showsSeatMove) && <span className={s.gapXl} />}
              <StickerButton
                asset={icon('study_focus.png')}
                size={bottomSize}
                label={t('studyFocusModeOpen')}
                onClick={onSetFocusMode ? () => onSetFocusMode(true) : undefined}
              />
            </>
          )}
        </div>
      )}

      {seatPlanOpen && (
        <div className={s.seatPlan}>
          <SeatPlanHeader />
        </div>
      )}

      {timer.phase === 'ready' && (
        <div
          className={`${s.miniTimer} ${studyTabBarHidden(props) ? s.miniTimerLow : ''} ${timerVeiled ? s.veiled : ''}`}
          aria-hidden={timerVeiled || undefined}
          inert={timerVeiled || undefined}
        >
          <MiniTimer
            timer={timer}
            onStart={props.onStart}
            onTogglePause={props.onTogglePause}
            onFinish={props.onFinish}
            onPickSubject={props.onPickSubject}
          />
        </div>
      )}
    </div>
    </>
  )
}
