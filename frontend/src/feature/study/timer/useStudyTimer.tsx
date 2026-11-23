// 공부 탭 타이머 연결: 서버 세션·통계·설정을 화면 값(StudyTimerView)으로 만들고 시작·일시정지·끝내기를 연결한다.
// 원본 StudyHomePage._togglePause·_finishHere·_showFinishedIfAny와 같은 흐름.
import { useEffect, useState } from 'react'
import { t } from '../../../l10n/t'
import { useToast } from '../../../core/ui/Toast'
import { AppBottomSheet, showSheet } from '../../../core/ui/AppBottomSheet'
import { AppButton } from '../../../core/ui/AppButton'
import { logger } from '../../../core/log/log'
import type { StudyTimerView } from '../home/studyTimerView'
import { formatStudyClock, formatStudyDuration } from '../home/studyFormat'
import { elapsedMs, finish, isRunning, pause, resume, start, startPresence, useTimer } from './timerStore'
import { loadStats, useStats } from './statsStore'
import { loadSettings, useStudySettings } from './settingsStore'
import { subjectColorOf } from './subjectPalette'
import { dateKey, splitByStudyDate, studyDateOf } from './studyDay'

const log = logger('StudyTimerUi')

export function useStudyTimer(hasOwner: boolean) {
  const timer = useTimer()
  const stats = useStats()
  const settings = useStudySettings()
  const toast = useToast()
  const [, tick] = useState(0)

  useEffect(() => {
    if (!hasOwner) return
    void loadSettings()
    void loadStats()
    return startPresence()
  }, [hasOwner])

  const session = timer.session
  const running = session != null && isRunning(session)
  // 흐르는 동안 1초마다 다시 그린다(표시만, 값은 서버 구간에서 계산).
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [running])

  const focusedSeconds = session ? Math.floor(elapsedMs(session, timer.offsetMs) / 1000) : 0
  const subject = session ? session.subject : settings?.subject ?? null

  // 오늘 이 과목: 서버 통계(끝낸 기록) + 진행 중 세션 중 오늘 공부일 몫(원본 todayFor).
  const todayKey = dateKey(studyDateOf(new Date()))
  const base = stats?.today_by_subject.find((x) => x.subject === subject)?.seconds ?? 0
  let live = 0
  if (session && session.subject === subject) {
    const serverNow = Date.now() + timer.offsetMs
    const intervals = session.segments.map((sg) => ({ start: Date.parse(sg.started_at), end: sg.ended_at ? Date.parse(sg.ended_at) : serverNow }))
    live = Math.floor((splitByStudyDate(intervals).get(todayKey) ?? 0) / 1000)
  }

  // 탭 제목에 시간(웹 대체: Live Activity 대신).
  useEffect(() => {
    document.title = session ? `${formatStudyClock(focusedSeconds)} · StudyVillage` : 'StudyVillage'
  }, [session, focusedSeconds])

  const view: StudyTimerView = {
    phase: !hasOwner ? 'noAccount' : timer.loaded && settings ? 'ready' : 'loading',
    hasOwner,
    session: !session ? 'none' : running ? 'running' : 'paused',
    subject,
    subjectColor: subject && settings ? subjectColorOf(settings, subject).ink : null,
    todaySeconds: base + live,
    focusedSeconds,
  }

  const failed = (e: unknown) => {
    log.warn('timer action failed', { reason: e instanceof Error ? e.message : String(e) })
    toast(t('studyActionFailed'), { type: 'error' })
  }

  const onTogglePause = async () => {
    try {
      if (!session) await start(settings?.subject ?? null)
      else if (isRunning(session)) await pause(session.id)
      else await resume(session.id)
    } catch (e) { failed(e) }
  }

  const onFinish = async () => {
    if (!session) return
    const ok = await showSheet<boolean>((close) => (
      <AppBottomSheet dark title={t('studyFinishSheetTitle')} description={t('studyFinishSheetBody')} contentPadding="16px 24px 0" onDismiss={() => close(false)}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><AppButton expand background="var(--c-soft-fill)" foreground="var(--c-primary)" onClick={() => close(false)}>{t('studyKeepGoing')}</AppButton></div>
          <div style={{ flex: 1 }}><AppButton expand onClick={() => close(true)}>{t('studyFinish')}</AppButton></div>
        </div>
      </AppBottomSheet>
    ))
    if (!ok) return
    try {
      const record = await finish(session.id)
      void loadStats()
      if (record) toast(t('studyFinishedSnack', { duration: formatStudyDuration(record.focused_seconds) }))
    } catch (e) { failed(e) }
  }

  return { view, onTogglePause, onFinish }
}
