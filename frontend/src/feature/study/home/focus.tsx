import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconPlayerStopFilled } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import { IslandSurface } from '../../../core/ui/IslandSurface'
import { formatStudyClock } from './studyFormat'
import type { StudyTimerView } from './studyTimerView'
import s from './focus.module.css'

/**
 * 원본: `_StudyFocusClock`. 집중 모드에서 내 머리 위에 띄우는 과목과 지금 시간. 세로 화면은
 * 머리 위로 xxl×3 띄우고, 가로 화면은 띄우지 않는다.
 */
export function FocusClock(props: { timer: StudyTimerView; portrait: boolean; large?: boolean }) {
  return (
    <div className={`${s.clock} ${props.large ? s.clockLarge : ''}`} style={{ paddingBottom: props.portrait ? 24 * 3 : 0 }}>
      <span className={s.clockSubject}>{props.timer.subject ?? t('studySubjectNone')}</span>
      <span className={s.clockTime}>{formatStudyClock(props.timer.focusedSeconds)}</span>
    </div>
  )
}

/**
 * 원본: `_StudyFocusControls`. 집중 모드에서 내 책상 아래에 두는 재생·일시정지와 끝내기(섬 단추 72).
 * 끝내기는 세션이 없으면 누를 수 없다.
 */
export function FocusControls(props: { timer: StudyTimerView; onTogglePause?: () => void; onFinish?: () => void; size?: number }) {
  const active = props.timer.session !== 'none'
  const running = props.timer.session === 'running'
  const onFinish = props.onFinish
  const size = props.size ?? 72
  return (
    <div className={`${s.controls} palette-day`}>
      <IslandIconButton
        size={size}
        iconSize={Math.round(size * 0.42)}
        icon={running ? IconPlayerPauseFilled : IconPlayerPlayFilled}
        label={!active ? t('studyStartFocus') : running ? t('studyPause') : t('studyResume')}
        // 지금 할 일(재생·일시정지)을 앱 강조색으로. 원본은 늘 누를 수 있는 단추다.
        emphasis="var(--c-accent)"
        onClick={() => props.onTogglePause?.()}
      />
      {/* 세션이 없으면 끝낼 것이 없으니 끝내기는 숨긴다(사용자 결정 2026-11-23, 원본은 흐리게 둔다). */}
      {active && (
        <>
          <span className={s.gap} />
          <IslandIconButton
            size={size}
            iconSize={Math.round(size * 0.42)}
            icon={IconPlayerStopFilled}
            label={t('studyFinish')}
            onClick={onFinish ? () => onFinish() : undefined}
          />
        </>
      )}
    </div>
  )
}

/** 원본: `_SeatPlanHeader`. 자리 이동 중 위 안내: 제목과 "빈자리를 누르면 그 자리로 옮겨요". */
export function SeatPlanHeader() {
  return (
    <IslandSurface radius={24}>
      <span className={s.seatPlan}>
        <span className={s.seatPlanTitle}>{t('studySeatPlanTitle')}</span>
        <span className={s.seatPlanHint}>{t('studySeatPlanHint')}</span>
      </span>
    </IslandSurface>
  )
}

/**
 * 넓은 화면(PC) 집중 모드: 원본 가로 화면처럼 시간은 왼쪽, 단추는 오른쪽(양끝 정렬)에 두되 크게,
 * 화면 세로 가운데에 둔다(사용자 결정 2026-11-23).
 */
export function FocusStack(props: { timer: StudyTimerView; onTogglePause?: () => void; onFinish?: () => void }) {
  return (
    <div className={s.stack}>
      <FocusClock timer={props.timer} portrait={false} large />
      <FocusControls timer={props.timer} onTogglePause={props.onTogglePause} onFinish={props.onFinish} size={96} />
    </div>
  )
}
