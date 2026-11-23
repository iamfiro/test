// 개발 빌드 전용 목. OpenAPI 계약(server/docs/api/openapi.yaml) 모양만 흉내 낸다. 서버 의미는 계산하지 않는다.
import { http, HttpResponse } from 'msw/http'
import type { components } from '../core/api/schema'
import { API, fail, ok } from './util'
import { timerHandlers } from './timer'
import { roomHandlers } from './rooms'
import { tagHandlers } from './tags'

type Session = components['schemas']['Session']
let signedIn = sessionStorageFlag()
const me: components['schemas']['Me'] = {
  id: '00000000-0000-4000-8000-000000000001',
  created_at: '2026-11-23T00:00:00Z',
  profile: { nickname: '추운 비버', avatar: { shape: 'circle', color: 'orange', eyes: 'googly', mouth: 'smile', accessory: 'none' }, gender: 'male' },
}
const session = (): Session => ({ user: me, csrf_token: 'mock-csrf' })

// 목 로그인 상태만 새로고침 뒤에도 남긴다(개발 편의, 실제 세션은 서버 쿠키).
function sessionStorageFlag() { try { return sessionStorage.getItem('mock_signed_in') === '1' } catch { return false } }
function setSignedIn(v: boolean) { signedIn = v; try { sessionStorage.setItem('mock_signed_in', v ? '1' : '0') } catch { /* 저장 못 해도 동작 */ } }

export const handlers = [
  http.get(`${API}/auth/session`, () => (signedIn ? ok(session()) : fail(401, 'UNAUTHORIZED', 'Authentication required'))),
  http.get(`${API}/auth/nonce`, () => ok({ nonce: 'mock-nonce' })),
  http.post(`${API}/auth/login/dev`, () => { setSignedIn(true); return ok(session()) }),
  http.post(`${API}/auth/logout`, () => { setSignedIn(false); return new HttpResponse(null, { status: 204 }) }),
  http.get(`${API}/users/me/profile`, () => ok({ profile: me.profile })),
  ...timerHandlers,
  ...roomHandlers,
  ...tagHandlers,
]
