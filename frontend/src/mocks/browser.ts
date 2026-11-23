import { getResponse } from 'msw'
import { handlers } from './handlers'
import { setTransport } from '../core/api/client'
import { logger } from '../core/log/log'
import { setChatSocketFactory } from '../feature/study/chat/chatSocket'
import { mockChatSocketFactory } from './chat'

const log = logger('Mock')

/**
 * 목 응답을 fetch 단계에서 돌려준다(Service Worker를 막는 내장 브라우저에서도 동작).
 * 목이 없는 요청은 실제 서버로 보내지 않고 501로 드러낸다.
 */
export async function startMockWorker() {
  setChatSocketFactory(mockChatSocketFactory)
  setTransport(async (request) => {
    const res = await getResponse(handlers, request)
    if (res) return res
    log.warn('no mock handler', { method: request.method, path: new URL(request.url).pathname })
    return Response.json({ data: null, error: { code: 'MOCK_MISSING', message: 'no mock handler' }, meta: { requestId: 'mock', timestamp: new Date().toISOString() } }, { status: 501 })
  })
}
