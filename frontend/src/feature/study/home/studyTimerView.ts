/** 원본 StudyTimerPhase. */
export type StudyTimerPhase = 'loading' | 'noAccount' | 'failed' | 'ready'

/** 원본 `timer.active`: 세션 없음(null) · 흐르는 중(isRunning) · 일시정지. */
export type StudySessionState = 'none' | 'running' | 'paused'

/**
 * 공부 탭 오버레이가 그리는 타이머 상태(원본 StudyTimerController에서 화면이 읽는 값만).
 * 이름·색·시간은 원본처럼 받아서 화면이 ARB 문구로 만든다.
 */
export type StudyTimerView = {
  phase: StudyTimerPhase
  /** 원본 `timer.ownerId != null`: 내 계정 확인됨. */
  hasOwner: boolean
  session: StudySessionState
  /** 세션 중이면 세션 과목, 아니면 설정의 과목. null이면 과목 없음. */
  subject: string | null
  /** StudySubjectPalette.of(settings, subject).ink. subject가 null이면 쓰지 않는다. */
  subjectColor: string | null
  /** `timer.todayFor(subject)`(초). */
  todaySeconds: number
  /** `timer.displayFocused`(초). */
  focusedSeconds: number
}
