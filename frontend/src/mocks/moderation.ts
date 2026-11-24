// 개발 목: 채팅 차단·신고와 방 자리 옮기기(계약 openapi.yaml createReport·listChatBlocks·blockChatUser·unblockChatUser·
// moveStudyRoomSeat). 응답 모양과 멱등 키 확인만 흉내 내고, 신고 누적·숨김·자리 겹침 같은 서버 판정은 하지 않는다.
// 차단한 사람 이름·캐릭터는 목이 모르므로 고정 값을 쓴다.
import { http, HttpResponse } from 'msw/http'
import type { components } from '../core/api/schema'
import { API, fail, ok } from './util'

type ChatBlock = components['schemas']['ChatBlock']
type ReportCreate = components['schemas']['ReportCreate']

const blocks = new Map<string, ChatBlock>()
const needsKey = (request: Request) => (request.headers.get('Idempotency-Key') ? null : fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key required'))

export const moderationHandlers = [
  http.post(`${API}/reports`, async ({ request }) => {
    const missing = needsKey(request)
    if (missing) return missing
    const body = (await request.json()) as ReportCreate
    if (body.reason === 'other' && !(body.detail ?? '').trim()) return fail(422, 'VALIDATION_ERROR', 'detail required')
    return ok({ report: { target_type: body.target_type, target_id: body.target_id, reason: body.reason, created_at: new Date().toISOString() } })
  }),
  http.get(`${API}/users/me/blocks`, () => ok({ blocks: [...blocks.values()].reverse() })),
  http.put(`${API}/users/me/blocks/:userId`, ({ request, params }) => {
    const missing = needsKey(request)
    if (missing) return missing
    const id = String(params.userId)
    const block = blocks.get(id) ?? { user_id: id, nickname: '졸린 다람쥐', avatar: { shape: 'circle', color: 'mint', eyes: 'dot', mouth: 'smile', accessory: 'none' }, blocked_at: new Date().toISOString() }
    blocks.set(id, block)
    return ok({ block })
  }),
  http.delete(`${API}/users/me/blocks/:userId`, ({ request, params }) => {
    const missing = needsKey(request)
    if (missing) return missing
    blocks.delete(String(params.userId))
    return new HttpResponse(null, { status: 204 })
  }),
  http.put(`${API}/study-rooms/:id/seat`, async ({ request }) => {
    const missing = needsKey(request)
    if (missing) return missing
    const { seat } = (await request.json()) as { seat: number }
    if (!Number.isInteger(seat) || seat < 0 || seat > 32) return fail(422, 'VALIDATION_ERROR', 'seat out of range')
    return ok({ seat })
  }),
]
