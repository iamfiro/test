// 개발 목: 타이머 계약 모양만 흉내 낸다. 통계는 계산하지 않고 0으로 채운다(서버 의미는 서버가 계산).
import { http, HttpResponse } from 'msw/http'
import type { components } from '../core/api/schema'
import { API, fail, ok } from './util'

type Session = components['schemas']['ActiveSession']
type Settings = components['schemas']['StudySettings']

let settings: Settings = { daily_goal_minutes: null, subjects: [], subject: null, subject_colors: {} }
let active: Session | null = null

const now = () => new Date().toISOString()

const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 개발용 표본: 날짜마다 정해진 모양의 공부량(초). `?stats=empty`면 전부 0. */
function sampleSeconds(from: Date, i: number, empty: boolean): number {
  if (empty) return 0
  const d = new Date(from)
  d.setDate(d.getDate() + i)
  const n = (d.getDate() * 7 + d.getMonth() * 13) % 11
  return n < 3 ? 0 : n * 1100
}

function dayList(from: Date, count: number, empty = true) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    return { date: localKey(d), seconds: sampleSeconds(from, i, empty) }
  })
}

export const timerHandlers = [
  http.get(`${API}/users/me/study-settings`, () => ok(settings)),
  http.put(`${API}/users/me/study-settings`, async ({ request }) => {
    settings = (await request.json()) as Settings
    return ok(settings)
  }),
  http.get(`${API}/study/active-session`, () => ok({ session: active })),
  http.post(`${API}/study/active-session/start`, async ({ request }) => {
    if (active) return ok({ session: active })
    const body = (await request.json()) as { subject: string | null; timezone: string }
    active = { id: crypto.randomUUID(), subject: body.subject, timezone: body.timezone, segments: [{ started_at: now(), ended_at: null }] }
    return ok({ session: active }, 201)
  }),
  http.post(`${API}/study/active-session/:id/pause`, ({ params }) => {
    if (!active || active.id !== params.id) return fail(409, 'SESSION_NOT_ACTIVE', 'not active')
    const last = active.segments[active.segments.length - 1]!
    if (last.ended_at == null) last.ended_at = now()
    return ok({ session: active })
  }),
  http.post(`${API}/study/active-session/:id/resume`, ({ params }) => {
    if (!active || active.id !== params.id) return fail(409, 'SESSION_NOT_ACTIVE', 'not active')
    const last = active.segments[active.segments.length - 1]!
    if (last.ended_at != null) active.segments.push({ started_at: now(), ended_at: null })
    return ok({ session: active })
  }),
  http.post(`${API}/study/active-session/:id/finish`, ({ params }) => {
    if (!active || active.id !== params.id) return fail(409, 'SESSION_NOT_ACTIVE', 'not active')
    const last = active.segments[active.segments.length - 1]!
    if (last.ended_at == null) last.ended_at = now()
    const seconds = Math.floor(active.segments.reduce((a, s) => a + (Date.parse(s.ended_at!) - Date.parse(s.started_at)), 0) / 1000)
    const record = seconds === 0 ? null : {
      id: active.id, subject: active.subject, started_at: active.segments[0]!.started_at, ended_at: last.ended_at!,
      focused_seconds: seconds, study_date: new Date().toISOString().slice(0, 10), segments: active.segments,
    }
    active = null
    return ok({ record })
  }),
  http.put(`${API}/study/presence`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${API}/study/stats`, () => {
    const empty = new URLSearchParams(location.search).get('stats') === 'empty'
    const today = new Date()
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const start16 = new Date(monday)
    start16.setDate(monday.getDate() - 15 * 7)
    const recent = dayList(start16, 112, empty)
    const todayRow = recent.find((d) => d.date === localKey(today))!
    const yesterday = recent.find((d) => d.date === localKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)))!
    const week = recent.slice(105)
    const weekTotal = week.reduce((sum, d) => sum + d.seconds, 0)
    let streak = 0
    for (let i = recent.findIndex((d) => d.date === todayRow.date) - (todayRow.seconds >= 600 ? 0 : 1); i >= 0 && recent[i]!.seconds >= 600; i--) streak++
    return ok({
      today: todayRow,
      today_by_subject: todayRow.seconds > 0 ? [
        // 개발용 표본 과목(프론트엔드 공부). 실제 값은 서버가 준다.
        { subject: 'React 렌더링', seconds: Math.floor(todayRow.seconds * 0.45) },
        { subject: 'JavaScript 이벤트 루프', seconds: Math.floor(todayRow.seconds * 0.35) },
        { subject: '브라우저 렌더링 파이프라인', seconds: todayRow.seconds - Math.floor(todayRow.seconds * 0.45) - Math.floor(todayRow.seconds * 0.35) },
      ].filter((r) => r.seconds > 0) : [],
      yesterday_seconds: yesterday.seconds,
      week: { days: week, total_seconds: weekTotal },
      streak_days: streak,
      subjects_week: empty || weekTotal < 60 ? [] : [
        { subject: '수학', seconds: Math.floor(weekTotal * 0.5) },
        { subject: '영어', seconds: Math.floor(weekTotal * 0.3) },
        { subject: null, seconds: Math.floor(weekTotal * 0.2) },
      ].filter((r) => r.seconds >= 60),
      recent_weeks: recent,
    })
  }),
  http.get(`${API}/study/records`, () => ok({ items: [] })),
]
