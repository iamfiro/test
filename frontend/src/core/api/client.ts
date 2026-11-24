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

/**
 * 오류를 꺼낸다. openapi-fetch 결과(`{error: 봉투}`), 봉투(`{data, error}`), ApiError 어느 것을 줘도 같은 ApiError가 된다.
 * 요청 자체가 실패(fetch 예외)했으면 code `NETWORK`, 봉투가 아닌 응답(JSON이 아닌 5xx 등)이면 `HTTP_ERROR`.
 */
export function errorOf(e: unknown): ApiError {
  let cur: unknown = e
  for (let depth = 0; depth < 3 && cur != null && typeof cur === 'object'; depth++) {
    const o = cur as { code?: unknown; message?: unknown; error?: unknown }
    if (typeof o.code === 'string' && typeof o.message === 'string') return cur as ApiError
    if (cur instanceof Error || !('error' in o)) break
    cur = o.error
  }
  if (cur instanceof Error) return { code: 'NETWORK', message: cur.message }
  return { code: 'HTTP_ERROR', message: 'unexpected response' }
}
