// 온보딩 저장. 쓰기는 서버 성공 뒤에만 세션에 반영한다(optimistic 없음). 각 요청은 자기 Idempotency-Key를 갖고,
// 같은 내용을 다시 보낼 때(응답 유실·실패 뒤 다시 누름)는 같은 키를 쓴다. 내용이 바뀌면 새 키.
import { api, errorOf, newIdempotencyKey, type ApiError } from '../../../core/api/client'
import type { Me } from '../../auth/session'
import { logger } from '../../../core/log/log'
import { saveMyTags } from '../tags/tagsStore'
import type { Gender } from './onboardingScene'

const log = logger('Onboarding')

export type NicknameProblem = 'empty' | 'tooLong' | 'invalid'

const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' })
/** 계약 Nickname: 앞뒤 공백을 지운 뒤 1–12자(grapheme), UTF-8 48바이트 이하, 제어 문자 금지. */
export const nicknameMax = 12
const nicknameBytesMax = 48

export function nicknameProblem(raw: string): NicknameProblem | null {
  const name = raw.trim()
  if (name.length === 0) return 'empty'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) return 'invalid'
  if ([...segmenter.segment(name)].length > nicknameMax || new TextEncoder().encode(name).length > nicknameBytesMax) return 'tooLong'
  return null
}

export class OnboardingSaveError extends Error {
  constructor(readonly api: ApiError, readonly field: string | null) {
    super(`onboarding save failed: ${api.code}`)
  }
}

function fieldOf(e: ApiError): string | null {
  const d = e.details as { field?: unknown } | undefined
  return typeof d?.field === 'string' ? d.field : null
}

/** 한 번의 온보딩 동안 쓰는 키를 들고 있다. 같은 내용이면 같은 키를 돌려준다. */
export class OnboardingSaver {
  private profileKey: { sig: string; key: string } | null = null
  private tagsKey: { sig: string; key: string } | null = null
  private completeKey: string | null = null

  private keyFor(slot: 'profileKey' | 'tagsKey', sig: string): string {
    const cur = this[slot]
    if (cur?.sig === sig) return cur.key
    const next = { sig, key: newIdempotencyKey() }
    this[slot] = next
    return next.key
  }

  /**
   * 성별·이름을 저장하고, 고른 태그가 지금 서버 값과 다르면 태그도 저장한다. 둘 다 성공해야 바뀐 Me를 돌려준다.
   * 실패하면 OnboardingSaveError(어느 칸 때문인지 field). 호출한 쪽은 고른 값을 그대로 둔다.
   */
  async saveProfile(me: Me, input: { gender: Gender; nickname: string; tagIds: string[] }): Promise<Me> {
    const nickname = input.nickname.trim()
    const body = { gender: input.gender, nickname }
    const res = await api.PATCH('/users/me/profile', {
      params: { header: { 'Idempotency-Key': this.keyFor('profileKey', JSON.stringify(body)) } },
      body,
    }).catch((e: unknown) => ({ data: undefined, error: e }))
    if (!res.data) {
      const e = errorOf(res)
      log.warn('profile save failed', { code: e.code })
      throw new OnboardingSaveError(e, fieldOf(e))
    }
    let profile = res.data.data.profile
    const same = input.tagIds.join() === profile.tags.map((t) => t.id).join()
    if (!same) {
      try {
        const tags = await saveMyTags(input.tagIds, this.keyFor('tagsKey', input.tagIds.join()))
        profile = { ...profile, tags }
      } catch (e) {
        const api = (e as { api?: ApiError }).api ?? errorOf(e)
        throw new OnboardingSaveError(api, 'tags')
      }
    }
    log.info('profile saved', { tags: profile.tags.length })
    return { ...me, profile }
  }

  /** 끝까지 봤거나 건너뛰었다고 서버에 남긴다. 실패하면 OnboardingSaveError. */
  async complete(): Promise<Me> {
    this.completeKey ??= newIdempotencyKey()
    const res = await api.PUT('/users/me/onboarding', { params: { header: { 'Idempotency-Key': this.completeKey } } })
      .catch((e: unknown) => ({ data: undefined, error: e }))
    if (!res.data) {
      const e = errorOf(res)
      log.warn('complete failed', { code: e.code })
      throw new OnboardingSaveError(e, null)
    }
    return res.data.data
  }
}
