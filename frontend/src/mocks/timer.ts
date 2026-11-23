// 개발 목: 타이머 계약 모양만 흉내 낸다. 통계는 계산하지 않고 0으로 채운다(서버 의미는 서버가 계산).
import { http, HttpResponse } from 'msw/http'
import type { components } from '../core/api/schema'
import { API, fail, ok } from './util'

type Session = components['schemas']['ActiveSession']
type Settings = components['schemas']['StudySettings']

let settings: Settings = { daily_goal_minutes: null, subjects: [], subject: null, subject_colors: {} }
let active: Session | null = null

const now = () => new Date().toISOString()

function dayList(from: Date, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from)
    d.setDate(d.getDate() + i)
    return { date: d.toISOString().slice(0, 10), seconds: 0 }
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
    const today = new Date()
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    const start16 = new Date(monday)
    start16.setDate(monday.getDate() - 15 * 7)
    return ok({
      today: { date: today.toISOString().slice(0, 10), seconds: 0 },
      today_by_subject: [],
      yesterday_seconds: 0,
      week: { days: dayList(monday, 7), total_seconds: 0 },
      streak_days: 0,
      subjects_week: [],
      recent_weeks: dayList(start16, 112),
    })
  }),
  http.get(`${API}/study/records`, () => ok({ items: [] })),
]
