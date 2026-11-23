import { IconLock, IconPlayerPauseFilled, IconPlayerPlayFilled, IconPlayerStopFilled, IconSelector } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { IslandSurface } from '../../../core/ui/IslandSurface'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import { useToast } from '../../../core/ui/Toast'
import { Collapse } from './Collapse'
import { formatStudyClock, formatStudyDuration } from './studyFormat'
import type { StudyTimerView } from './studyTimerView'
import s from './MiniTimer.module.css'

/** 턱까지 합친 높이. 카드 얼굴은 height - ledge. */
export const miniTimerHeight = 60
const ledge = 5

/**
 * 원본: `_StudyMiniTimer`. 공부 탭 아래에 떠 있는 타이머 한 줄. 왼쪽 과목 카드(최대 260),
 * 가운데 지금 시간과 재생·일시정지, 공부 중이면 오른쪽 끝내기 단추. 늘 낮 섬 색(크림 종이).
 */
export function MiniTimer(props: {
  timer: StudyTimerView
  onStart?: () => void
  onTogglePause?: () => void
  onFinish?: () => void
  onPickSubject?: () => void
}) {
  const toast = useToast()
  const { timer } = props
  const active = timer.session !== 'none'
  const running = timer.session === 'running'
  const label = !active ? t('studyStartFocus') : running ? t('studyPause') : t('studyResume')
  // 과목: 세션 중에는 바꾸지 않는다(잰 시간이 옮겨 가지 않게).
  const onSubject = active ? () => toast(t('studySubjectLocked')) : props.onPickSubject
  const SubjectIcon = active ? IconLock : IconSelector

  return (
    <div className={s.row} style={{ height: miniTimerHeight }}>
      <div className={s.subjectSlot}>
        <IslandSurface stadium ledge={ledge} className={s.fill} onClick={onSubject}>
          <span className={s.subject}>
            <span
              className={s.subjectBar}
              style={{
                background: timer.subject == null || timer.subjectColor == null
                  ? 'color-mix(in srgb, var(--i-ink-soft) 40%, transparent)'
                  : timer.subjectColor,
              }}
            />
            <span className={s.subjectText}>
              <span className={s.subjectName}>{timer.subject ?? t('studySubjectNone')}</span>
              <span className={s.subjectToday}>
                {t('studySubjectToday', { duration: formatStudyDuration(timer.todaySeconds) })}
              </span>
            </span>
            <SubjectIcon className={s.subjectIcon} size={18} stroke={2} aria-hidden />
          </span>
        </IslandSurface>
      </div>
      <span className={s.gap} />
      <IslandSurface stadium ledge={ledge} className={s.clockCard}>
        <span className={s.clock}>
          <span className={s.clockText}>{formatStudyClock(timer.focusedSeconds)}</span>
          <IslandIconButton
            size={46}
            iconSize={20}
            label={label}
            icon={running ? IconPlayerPauseFilled : IconPlayerPlayFilled}
            emphasis="var(--c-accent)"
            // 원본은 늘 누를 수 있는 단추라(비활성 모양 없음) 연결 전에도 같은 모양을 유지한다.
            onClick={() => (active ? props.onTogglePause?.() : props.onStart?.())}
          />
        </span>
      </IslandSurface>
      <Collapse show={active}>
        <span className={s.gap} />
        <IslandIconButton
          size={miniTimerHeight}
          iconSize={20}
          label={t('studyFinish')}
          icon={IconPlayerStopFilled}
          onClick={() => props.onFinish?.()}
        />
      </Collapse>
    </div>
  )
}
