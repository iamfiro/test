// 온보딩 4단계: 방 안 공부 탭 위 코치 마크. 짚는 단추 둘레만 밝히고 나머지는 어둡게 가린 뒤 크림 종이 말풍선으로
// 앱 ARB studyOnboarding* 문구를 차례로 보인다. 마지막 단추는 "시작하기", 언제든 건너뛸 수 있다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { IslandButton } from '../../../core/ui/IslandButton'
import { studyDayStartHour } from '../timer/studyDay'
import { streakMinSeconds } from '../stats/useStatsView'
import s from './coach.module.css'

type Mark = { target: string; title: () => string; description: () => string }

const marks: Mark[] = [
  { target: 'timer', title: () => t('studyOnboardingTimerTitle'), description: () => t('studyOnboardingTimerDescription') },
  { target: 'sounds', title: () => t('studyOnboardingSoundsTitle'), description: () => t('studyOnboardingSoundsDescription') },
  { target: 'tab-rooms', title: () => t('studyOnboardingRoomsTitle'), description: () => t('studyOnboardingRoomsDescription') },
  {
    target: 'tab-stats',
    // 서버 규칙 값: 연속일 하루 최소 10분(useStatsView), 공부일 경계 04:00(studyDay).
    title: () => t('studyOnboardingStreakTitle', { minutes: streakMinSeconds / 60 }),
    description: () => t('studyOnboardingStreakDescription', { hour: studyDayStartHour }),
  },
]

type Rect = { left: number; top: number; width: number; height: number }
const pad = 8

export function CoachMarks(props: { onDone: () => Promise<void> }) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [busy, setBusy] = useState(false)
  const bubble = useRef<HTMLDivElement>(null)
  const mark = marks[index]!
  const last = index === marks.length - 1

  // 짚는 단추 위치를 따라간다(탭바가 올라오는 움직임·창 크기 바뀜).
  useLayoutEffect(() => {
    let raf = 0
    let prev = ''
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-coach="${mark.target}"]`)
      const r = el?.getBoundingClientRect()
      const next = r && r.width > 0 ? { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 } : null
      const key = next ? `${Math.round(next.left)},${Math.round(next.top)},${Math.round(next.width)},${Math.round(next.height)}` : ''
      if (key !== prev) { prev = key; setRect(next) }
      raf = requestAnimationFrame(measure)
    }
    measure()
    return () => cancelAnimationFrame(raf)
  }, [mark.target])

  useEffect(() => { bubble.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }) }, [index])

  const finish = async () => {
    if (busy) return
    setBusy(true)
    try { await props.onDone() } catch { setBusy(false) }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') void finish() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const vh = window.innerHeight
  const below = rect ? rect.top + rect.height / 2 < vh / 2 : false
  const bubbleStyle = rect
    ? below ? { top: rect.top + rect.height + 14 } : { bottom: vh - rect.top + 14 }
    : { bottom: 120 }
  // 말풍선은 앱 폭 컬럼(양옆 12) 안에 둔다. 꼬리는 짚는 단추 가운데를 가리킨다.
  const columnWidth = Math.min(window.innerWidth - 24, 430 - 24)
  const columnLeft = (window.innerWidth - columnWidth) / 2
  const tailLeft = rect ? Math.min(columnWidth - 28, Math.max(28, rect.left + rect.width / 2 - columnLeft)) : null

  return (
    <div className={`${s.root} palette-day`} role="dialog" aria-modal="true" aria-label={mark.title()}>
      <svg className={s.shade} aria-hidden>
        <defs>
          <mask id="coach-hole">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx={Math.min(28, rect.height / 2)} fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" mask="url(#coach-hole)" />
      </svg>
      {rect && <span className={s.ring} style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, borderRadius: Math.min(28, rect.height / 2) }} aria-hidden />}
      <div className={s.column} style={bubbleStyle}>
        <div ref={bubble} className={`${s.bubble} ${below ? s.bubbleBelow : s.bubbleAbove}`} key={index}>
          {tailLeft != null && <span className={s.tail} style={{ left: tailLeft }} aria-hidden />}
          <h2 className={s.title} tabIndex={-1}>{mark.title()}</h2>
          <p className={s.description}>{mark.description()}</p>
          <div className={s.footer}>
            <span className={s.dots} aria-label={t('studyOnboardingProgress', { total: marks.length, current: index + 1 })}>
              {marks.map((_, i) => <i key={i} className={i === index ? s.dotOn : undefined} />)}
            </span>
            {!last && <button type="button" className={s.skip} onClick={() => void finish()}>{webText.onboardingSkip}</button>}
            <IslandButton
              primary
              label={last ? t('studyOnboardingStart') : webText.onboardingNext}
              onClick={busy ? undefined : last ? () => void finish() : () => setIndex(index + 1)}
              minHeight={40}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
