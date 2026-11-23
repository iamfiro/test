import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'
import { logger } from '../log/log'

const log = logger('Api')
const origin = import.meta.env.VITE_API_ORIGIN as string | undefined
if (!origin) throw new Error('VITE_API_ORIGIN is not set')

/** 세션 CSRF 토큰. 메모리에만 둔다(저장소에 쓰지 않음). `GET /auth/session`·로그인 응답이 채운다. */
let csrfToken: string | null = null
export function setCsrfToken(token: string | null) { csrfToken = token }

const unsafe = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const middleware: Middleware = {
  onRequest({ request }) {
    if (unsafe.has(request.method) && csrfToken) request.headers.set('X-CSRF-Token', csrfToken)
    return request
  },
  onResponse({ request, response }) {
    const path = new URL(request.url).pathname
    const fields = { method: request.method, path, status: response.status }
    if (response.status >= 500) log.error('request failed', fields)
    else log.debug('request', fields)
    return response
  },
}

/** 요청을 실제로 보내는 함수. 개발 목 모드에서만 main.tsx가 목 응답 함수로 바꾼다. */
let transport: (request: Request) => Promise<Response> = (request) => globalThis.fetch(request)
export function setTransport(fn: (request: Request) => Promise<Response>) { transport = fn }

export const api = createClient<paths>({ baseUrl: origin, credentials: 'include', fetch: (request) => transport(request) })
api.use(middleware)

/** 쓰기 요청마다 새 키. 응답을 못 받아 다시 보낼 때는 같은 키를 그대로 쓴다. */
export function newIdempotencyKey(): string { return crypto.randomUUID() }

export type ApiError = { code: string; message: string; details?: unknown }

/** 봉투 `{data, error}`에서 오류를 꺼낸다. 네트워크 실패는 code `NETWORK`로 바꾼다. */
export function errorOf(e: unknown): ApiError {
  if (e && typeof e === 'object' && 'error' in e) {
    const err = (e as { error: ApiError | null }).error
    if (err) return err
  }
  return { code: 'NETWORK', message: e instanceof Error ? e.message : 'network error' }
}
