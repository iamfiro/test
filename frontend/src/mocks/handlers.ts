// 개발 빌드 전용 목. OpenAPI 계약(server/docs/api/openapi.yaml) 모양만 흉내 낸다. 서버 의미는 계산하지 않는다.
import { http, HttpResponse } from 'msw/http'
import type { components } from '../core/api/schema'
import { API, fail, ok } from './util'
import { timerHandlers } from './timer'
import { roomHandlers } from './rooms'
import { myTags, resetMyTags, tagHandlers } from './tags'

type Me = components['schemas']['Me']
type Session = components['schemas']['Session']
type Account = Omit<Me, 'profile'> & { profile: Omit<Me['profile'], 'tags'> }

/** subject `me`: 온보딩을 마친 계정. 그 밖의 subject: 로그인할 때마다 갓 가입한 계정(성별 없음, 온보딩 전). */
const veteran = (): Account => ({
  id: '00000000-0000-4000-8000-000000000001',
  created_at: '2026-11-23T00:00:00Z',
  onboarding_completed_at: '2026-11-23T00:00:00Z',
  profile: { nickname: '추운 비버', avatar: { shape: 'circle', color: 'orange', eyes: 'googly', mouth: 'smile', accessory: 'none' }, gender: 'male' },
})
const newcomer = (): Account => ({
  id: '00000000-0000-4000-8000-000000000002',
  created_at: new Date().toISOString(),
  onboarding_completed_at: null,
  profile: { nickname: '졸린 수달', avatar: { shape: 'cloud', color: 'mint', eyes: 'happy', mouth: 'small', accessory: 'sprout' }, gender: null },
})

// 목 로그인 상태와 목 계정만 새로고침 뒤에도 남긴다(개발 편의, 실제 세션은 서버 쿠키·서버 DB).
let account: Account | null = readAccount()
function readAccount(): Account | null { try { const v = sessionStorage.getItem('mock_account'); return v ? (JSON.parse(v) as Account) : null } catch { return null } }
function writeAccount(v: Account | null) { account = v; try { if (v) sessionStorage.setItem('mock_account', JSON.stringify(v)); else sessionStorage.removeItem('mock_account') } catch { /* 저장 못 해도 동작 */ } }

const meOf = (a: Account): Me => ({ ...a, profile: { ...a.profile, tags: myTags() } })
const session = (a: Account): Session => ({ user: meOf(a), csrf_token: 'mock-csrf' })
const graphemes = (s: string) => [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s)].length

/** 목 프로필 수정 실패를 일부러 일으킨다(개발 확인용): 닉네임이 `실패`면 500. */
export const handlers = [
  http.get(`${API}/auth/session`, () => (account ? ok(session(account)) : fail(401, 'UNAUTHORIZED', 'Authentication required'))),
  http.get(`${API}/auth/nonce`, () => ok({ nonce: 'mock-nonce' })),
  http.post(`${API}/auth/login/dev`, async ({ request }) => {
    const { subject } = (await request.json()) as { subject: string }
    const next = subject === 'me' ? veteran() : newcomer()
    if (subject !== 'me') resetMyTags()
    writeAccount(next)
    return ok(session(next))
  }),
  http.post(`${API}/auth/logout`, () => { writeAccount(null); return new HttpResponse(null, { status: 204 }) }),
  http.get(`${API}/users/me/profile`, () => (account ? ok({ profile: meOf(account).profile }) : fail(401, 'UNAUTHORIZED', 'Authentication required'))),
  http.patch(`${API}/users/me/profile`, async ({ request }) => {
    if (!account) return fail(401, 'UNAUTHORIZED', 'Authentication required')
    const body = (await request.json()) as components['schemas']['ProfileUpdate']
    if (body.nickname != null) {
      const n = body.nickname.trim()
      if (n === '실패') return fail(500, 'INTERNAL', 'mock failure')
      if (graphemes(n) < 1 || graphemes(n) > 12) {
        return HttpResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'invalid nickname', details: { field: 'nickname' } }, meta: { requestId: 'mock', timestamp: new Date().toISOString() } }, { status: 422 })
      }
      body.nickname = n
    }
    writeAccount({ ...account, profile: { ...account.profile, ...body } })
    return ok({ profile: meOf(account!).profile })
  }),
  http.put(`${API}/users/me/onboarding`, () => {
    if (!account) return fail(401, 'UNAUTHORIZED', 'Authentication required')
    writeAccount({ ...account, onboarding_completed_at: account.onboarding_completed_at ?? new Date().toISOString() })
    return ok(meOf(account!))
  }),
  ...timerHandlers,
  ...roomHandlers,
  ...tagHandlers,
]
