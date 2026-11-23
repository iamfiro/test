// 공부 탭의 통계(원본 study_stats_view.dart): 호수 청록 바탕 위에 오늘 공부한 시간, 요약 팻말,
// 그 아래 종이 칸에 이번 주 막대 → 과목별 비중 → 최근 16주 잔디. 공부량은 청록 한 가지 진하기로만 쓴다.
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { IslandSurface } from '../../../core/ui/IslandSurface'
import { formatStudyDuration } from '../home/studyFormat'
import { useStudySettings } from '../timer/settingsStore'
import { StreakFlame } from './StreakFlame'
import { useStatsView, type StatsView } from './useStatsView'
import s from './stats.module.css'

const weekdays = ['월', '화', '수', '목', '금', '토', '일']

/** 공부량 → 청록 진하기(0이면 빈 칸). 30분·1시간·2시간·3시간 경계의 다섯 단계(원본 _HeatmapCard._strength). */
function heatStrength(seconds: number): number {
  const minutes = Math.floor(seconds / 60)
  if (seconds <= 0) return 0
  if (minutes < 30) return 0.25
  if (minutes < 60) return 0.45
  if (minutes < 120) return 0.65
  if (minutes < 180) return 0.85
  return 1
}
const shade = (strength: number) => (strength <= 0 ? 'var(--i-muted)' : `color-mix(in srgb, var(--i-leaf) ${strength * 100}%, var(--i-muted))`)

export function StudyStatsPage() {
  const view = useStatsView()
  const settings = useStudySettings()
  return (
    <div className={`palette-on-lake ${s.page}`}>
      <div className={s.column}>
        {view == null ? <p className={s.loading}>{webText.statsLoading}</p> : <Body view={view} goalMinutes={settings?.daily_goal_minutes ?? null} />}
      </div>
    </div>
  )
}

function Body({ view, goalMinutes }: { view: StatsView; goalMinutes: number | null }) {
  const diff = view.todaySeconds - view.yesterdaySeconds
  const compare = Math.trunc(Math.abs(diff) / 60) === 0
    ? t('studyStatsVsYesterdaySame')
    : diff < 0
      ? t('studyStatsVsYesterdayLess', { duration: formatStudyDuration(-diff) })
      : t('studyStatsVsYesterdayMore', { duration: formatStudyDuration(diff) })
  const more = diff > 0 && Math.trunc(diff / 60) !== 0
  return (
    <>
      <section className={s.stage}>
        <div className={s.today}>{formatStudyDuration(view.todaySeconds)}</div>
        <div className={more ? `${s.compare} ${s.compareMore}` : s.compare}>{compare}</div>
        {goalMinutes != null && <GoalBar seconds={view.todaySeconds} goalSeconds={goalMinutes * 60} />}
        <Summary view={view} />
      </section>
      <Panel title={t('studyWeekTitle')}><WeekChart view={view} /></Panel>
      <SubjectCard rows={view.subjects} />
      <HeatmapCard view={view} />
    </>
  )
}

function Panel(props: { title?: string; children: React.ReactNode; tight?: boolean }) {
  return (
    <IslandSurface radius={22} ledge={4} className={s.panel}>
      <div className={props.tight ? s.panelTight : s.panelBody}>
        {props.title && <h2 className={s.panelTitle}>{props.title}</h2>}
        {props.children}
      </div>
    </IslandSurface>
  )
}

function GoalBar({ seconds, goalSeconds }: { seconds: number; goalSeconds: number }) {
  const ratio = goalSeconds === 0 ? 0 : Math.min(1, seconds / goalSeconds)
  const reached = ratio >= 1
  const goalText = formatStudyDuration(goalSeconds)
  return (
    <div className={s.goal}>
      <div className={s.goalTrack}>
        {ratio > 0 && <div className={reached ? `${s.goalFill} ${s.goalReached}` : s.goalFill} style={{ width: `${Math.max(ratio, 0.06) * 100}%` }} />}
      </div>
      <p className={reached ? `${s.goalText} ${s.compareMore}` : s.goalText}>
        {reached ? t('studyGoalReached', { goal: goalText }) : t('studyGoalProgress', { goal: goalText, percent: Math.floor(ratio * 100) })}
      </p>
    </div>
  )
}

function Summary({ view }: { view: StatsView }) {
  return (
    <Panel tight>
      <div className={s.summary}>
        <Figure label={t('studyWeekTitle')} value={formatStudyDuration(view.weekTotalSeconds)} />
        <Figure label={t('studyStatsDailyAverage')} value={formatStudyDuration(view.averageSeconds)} />
        <Figure label={webText.homeStudyStreakLabel} value={t('studyStatsStreakValue', { count: view.streakDays })} leading={<StreakFlame lit={view.streakDays > 0} size={20} />} />
      </div>
    </Panel>
  )
}

function Figure(props: { label: string; value: string; leading?: React.ReactNode }) {
  return (
    <div className={s.figure} role="group" aria-label={`${props.label}, ${props.value}`}>
      <div className={s.figureValue}>{props.leading}<span>{props.value}</span></div>
      <div className={s.figureLabel}>{props.label}</div>
    </div>
  )
}

function WeekChart({ view }: { view: StatsView }) {
  const longest = Math.max(0, ...view.weekDays.map((d) => d.seconds))
  return (
    <div>
      <div className={s.bars}>
        {view.weekDays.map((d, i) => {
          const isToday = d.key === view.todayKey
          const ratio = longest > 0 ? d.seconds / longest : 0
          const cls = isToday ? s.barToday : d.seconds > 0 ? s.barDone : s.barEmpty
          return (
            <div key={d.key} className={s.barSlot} role="img" aria-label={`${weekdays[i]}, ${formatStudyDuration(d.seconds)}`}>
              <div className={`${s.bar} ${cls}`} style={{ height: `${Math.max(ratio, 0.08) * 100}%` }} />
            </div>
          )
        })}
      </div>
      <div className={s.ground} />
      <div className={s.weekdays} aria-hidden="true">
        {view.weekDays.map((d, i) => (
          <div key={d.key} className={s.weekday}>
            {d.key === view.todayKey ? <span className={s.weekdayToday}>{weekdays[i]}</span> : weekdays[i]}
          </div>
        ))}
      </div>
    </div>
  )
}

function SubjectCard({ rows }: { rows: StatsView['subjects'] }) {
  const total = rows.reduce((sum, r) => sum + r.seconds, 0)
  const colorOf = (rank: number, subject: string | null) =>
    subject == null ? 'color-mix(in srgb, var(--i-ink-soft) 55%, var(--i-muted))' : shade(Math.max(1 - rank * 0.2, 0.3))
  return (
    <Panel title={t('studyStatsSubjectsTitle')}>
      {rows.length === 0 ? (
        <p className={s.empty}>{t('studyStatsSubjectsEmpty')}</p>
      ) : (
        <>
          <div className={s.share}>
            {rows.map((r, rank) => <div key={r.subject ?? '\u0000none'} style={{ flex: Math.max(r.seconds, 1), background: colorOf(rank, r.subject) }} />)}
          </div>
          <ul className={s.subjectList}>
            {rows.map((r, rank) => (
              <li key={r.subject ?? '\u0000none'} className={s.subjectRow}>
                <span className={s.dot} style={{ background: colorOf(rank, r.subject) }} />
                <span className={r.subject == null ? `${s.subjectName} ${s.subjectNone}` : s.subjectName}>{r.subject ?? t('studySubjectNone')}</span>
                <span className={s.subjectTime}>{formatStudyDuration(r.seconds)}</span>
                <span className={s.subjectPercent}>{Math.round((r.seconds * 100) / Math.max(total, 1))}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

function HeatmapCard({ view }: { view: StatsView }) {
  const weeks = 16
  return (
    <Panel title={t('studyStatsHeatmapTitle')}>
      <div className={s.heat}>
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className={s.heatWeek}>
            {Array.from({ length: 7 }, (_, d) => {
              const day = view.recent[w * 7 + d]!
              // 아직 오지 않은 날은 칸을 비워 둔다(날짜 문자열은 YYYY-MM-DD라 사전순이 날짜순).
              if (day.key > view.todayKey) return <div key={d} className={s.heatCell} />
              return (
                <div
                  key={d}
                  className={day.key === view.todayKey ? `${s.heatCell} ${s.heatToday}` : s.heatCell}
                  style={{ background: shade(heatStrength(day.seconds)) }}
                  role="img"
                  aria-label={`${day.key}, ${formatStudyDuration(day.seconds)}`}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className={s.legend}>
        <span>{t('studyStatsHeatmapLess')}</span>
        {[0, 0.25, 0.45, 0.65, 1].map((x) => <i key={x} style={{ background: shade(x) }} />)}
        <span>{t('studyStatsHeatmapMore')}</span>
      </div>
    </Panel>
  )
}
