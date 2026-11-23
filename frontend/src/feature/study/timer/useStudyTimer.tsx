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
import { currentSettings, loadSettings, useStudySettings } from './settingsStore'
import { buildRecap, type StudyRecap } from '../recap/studyRecap'
import { photoSlot } from '../recap/passportDraw'
import { takeRoomSnapshot } from '../room3d/roomSnapshot'
import { subjectColorOf } from './subjectPalette'
import { dateKey, splitByStudyDate, studyDateOf } from './studyDay'

const log = logger('StudyTimerUi')

/** nickname: 로그인한 사람의 닉네임(요약 카드 이름 칸). 로그인 전이면 null. */
export function useStudyTimer(nickname: string | null) {
  const hasOwner = nickname != null
  const timer = useTimer()
  const stats = useStats()
  const settings = useStudySettings()
  const toast = useToast()
  const [, tick] = useState(0)
  const [recap, setRecap] = useState<StudyRecap | null>(null)

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
    // 끝내기 전 내 자리 사진(카드 사진 칸). 방이 없으면 null이고 카드는 사진 칸 없이 그린다.
    // 여권 사진 칸은 작지만 저장 이미지는 2.5배라(렌더러 화소 배율 상한 2) 칸의 2배 화면으로 찍는다(비율은 같다).
    const photo = takeRoomSnapshot(photoSlot.width * 2, photoSlot.height * 2)
    try {
      const record = await finish(session.id)
      const fresh = await loadStats()
      if (!record) return
      toast(t('studyFinishedSnack', { duration: formatStudyDuration(record.focused_seconds) }))
      // 요약 카드는 끝낸 기록이 들어간 새 통계로만 만든다. 통계를 못 읽으면 카드 없이 기록 알림만 남긴다.
      if (fresh && nickname != null) setRecap(buildRecap({ stats: fresh, record, settings: currentSettings(), nickname, photo }))
      else log.warn('recap skipped: stats unavailable')
    } catch (e) { failed(e) }
  }

  return { view, onTogglePause, onFinish, recap, closeRecap: () => setRecap(null) }
}
