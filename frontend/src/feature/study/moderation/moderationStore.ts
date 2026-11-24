// 채팅 차단·신고(결정 9, docs/contracts/study-room-chat.md 0.2.0). 둘 다 HTTP 쓰기라 멱등 키를 붙이고, 서버가 받아들인
// 뒤에만 화면을 바꾼다. 차단 목록 조회는 캐시 우선(메모리에 있으면 먼저 보이고 뒤에서 다시 읽는다).
import { useEffect, useSyncExternalStore } from 'react'
import { api, errorOf, type ApiError } from '../../../core/api/client'
import type { components } from '../../../core/api/schema'
import { logger } from '../../../core/log/log'
import { chatStore } from '../chat/chatStore'

const log = logger('Moderation')

export type ChatBlock = components['schemas']['ChatBlock']
export type ReportCreate = components['schemas']['ReportCreate']
export type ReportReason = components['schemas']['ReportReason']

/** 서버 ReportReason 순서 그대로(계약 enum). 문구는 앱 report_reason.dart의 label. */
export const reportReasons: readonly ReportReason[] = ['personal_info', 'defamation', 'profanity', 'sexual', 'impersonation', 'spam', 'other']

export class ModerationError extends Error {
  constructor(readonly api: ApiError) { super(api.code) }
}

/** 사용자 id는 앞 4자만 로그에 남긴다. */
const tag = (id: string) => id.slice(0, 4)

type BlocksState = { blocks: ChatBlock[] | null; failed: boolean }
let blocksState: BlocksState = { blocks: null, failed: false }
const listeners = new Set<() => void>()
const setBlocks = (next: Partial<BlocksState>) => { blocksState = { ...blocksState, ...next }; listeners.forEach((l) => l()) }

export async function loadBlocks(): Promise<void> {
  const started = performance.now()
  const res = await api.GET('/users/me/blocks').catch((e: unknown) => ({ data: undefined, error: e }))
  if (!res.data) {
    log.warn('blocks load failed', { code: errorOf(res.error).code, elapsed_ms: Math.round(performance.now() - started) })
    // 이미 보이던 목록은 그대로 둔다.
    if (blocksState.blocks == null) setBlocks({ failed: true })
    return
  }
  setBlocks({ blocks: res.data.data.blocks, failed: false })
}

/** 차단 목록. 처음 쓰일 때 읽고, 있으면 캐시를 먼저 보인다. */
export function useBlocks(): BlocksState & { isBlocked: (userId: string) => boolean } {
  const state = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => blocksState)
  useEffect(() => { void loadBlocks() }, [])
  return { ...state, isBlocked: (userId) => state.blocks?.some((b) => b.user_id === userId) ?? false }
}

const keyHeader = (key: string) => ({ 'Idempotency-Key': key })

/** 차단. 서버가 받은 뒤에 목록에 넣고 그 사람의 말을 지금 채팅에서도 지운다. */
export async function blockUser(userId: string, key: string): Promise<void> {
  const started = performance.now()
  const res = await api.PUT('/users/me/blocks/{user_id}', { params: { path: { user_id: userId }, header: keyHeader(key) } })
    .catch((e: unknown) => ({ data: undefined, error: e }))
  const elapsed_ms = Math.round(performance.now() - started)
  if (!res.data) {
    const err = errorOf(res.error)
    log.warn('block failed', { user: tag(userId), code: err.code, elapsed_ms })
    throw new ModerationError(err)
  }
  const block = res.data.data.block
  setBlocks({ blocks: [block, ...(blocksState.blocks ?? []).filter((b) => b.user_id !== userId)] })
  chatStore.hideAuthor(userId)
  log.info('blocked', { user: tag(userId), elapsed_ms })
}

/** 차단 해제. 서버가 받은 뒤에 목록에서 빼고, 숨겼던 말이 다시 오게 채팅을 다시 받는다. */
export async function unblockUser(userId: string, key: string): Promise<void> {
  const started = performance.now()
  const res = await api.DELETE('/users/me/blocks/{user_id}', { params: { path: { user_id: userId }, header: keyHeader(key) } })
    .catch((e: unknown) => ({ data: undefined, error: e, response: undefined }))
  const elapsed_ms = Math.round(performance.now() - started)
  if (res.response?.status !== 204) {
    const err = errorOf(res.error)
    log.warn('unblock failed', { user: tag(userId), code: err.code, elapsed_ms })
    throw new ModerationError(err)
  }
  setBlocks({ blocks: (blocksState.blocks ?? []).filter((b) => b.user_id !== userId) })
  chatStore.rejoin()
  log.info('unblocked', { user: tag(userId), elapsed_ms })
}

/** 신고(닉네임·방 이름·메시지). 같은 신고를 다시 보내도 서버는 처음 신고를 돌려준다. */
export async function fileReport(body: ReportCreate, key: string): Promise<void> {
  const started = performance.now()
  const res = await api.POST('/reports', { params: { header: keyHeader(key) }, body })
    .catch((e: unknown) => ({ data: undefined, error: e }))
  const elapsed_ms = Math.round(performance.now() - started)
  if (!res.data) {
    const err = errorOf(res.error)
    log.warn('report failed', { target_type: body.target_type, code: err.code, elapsed_ms })
    throw new ModerationError(err)
  }
  log.info('reported', { target_type: body.target_type, reason: body.reason, elapsed_ms })
}
