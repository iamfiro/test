import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setTransport } from '../../../core/api/client'
import { ToastProvider } from '../../../core/ui/Toast'
import { SessionProvider } from '../../auth/session'
import { webText } from '../../../l10n/web_ko'
import { t } from '../../../l10n/t'
import { useOnboarding } from './useOnboarding'
import { nicknameProblem } from './onboardingSave'

// 사용자에게 보이는 것: 처음 온 사람은 캐릭터·이름·목표를 고르고 들어간다. 저장이 실패하면 그 단계에 머물고 고른 값이
// 그대로 남으며, 다시 누르면 서버에는 같은 Idempotency-Key로 가서 한 번만 적용된다. 온보딩을 마친 사람은 보지 않는다.
const toeic = { id: 't3', kind: 'exam', name: '토익' } as const
const avatar = { shape: 'cloud', color: 'mint', eyes: 'happy', mouth: 'small', accessory: 'sprout' } as const
const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({ data, error: null, meta: { requestId: 'r', timestamp: '2026-11-23T00:00:00Z' } }), { status, headers: { 'Content-Type': 'application/json' } })
const meOf = (over: { completed?: string | null; gender?: 'male' | 'female' | null; nickname?: string; tags?: typeof toeic[] } = {}) => ({
  id: '00000000-0000-4000-8000-000000000002',
  created_at: '2026-11-23T00:00:00Z',
  onboarding_completed_at: over.completed ?? null,
  profile: { nickname: over.nickname ?? '졸린 수달', avatar, gender: over.gender ?? null, tags: over.tags ?? [] },
})

function Harness() {
  const onboarding = useOnboarding(true)
  return <>{onboarding ? onboarding.overlay : <p>공부 탭</p>}</>
}
const app = () => render(<ToastProvider><SessionProvider><Harness /></SessionProvider></ToastProvider>)

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})
afterEach(cleanup)

describe('첫 가입 온보딩', () => {
  it('저장이 실패하면 목표 단계에 머물고 고른 값을 지키며, 다시 누르면 같은 키로 보낸다', async () => {
    const patchKeys: (string | null)[] = []
    const patchBodies: unknown[] = []
    let failNext = true
    setTransport(async (request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/auth/session') return envelope({ user: meOf(), csrf_token: 'c' })
      if (request.method === 'GET' && url.pathname === '/tags') return envelope({ tags: [toeic] })
      if (request.method === 'PATCH' && url.pathname === '/users/me/profile') {
        patchKeys.push(request.headers.get('Idempotency-Key'))
        patchBodies.push(await request.json())
        if (failNext) { failNext = false; throw new TypeError('network down') }
        return envelope({ profile: meOf({ gender: 'female', nickname: '공부하는 수달' }).profile })
      }
      if (request.method === 'PUT' && url.pathname === '/users/me/tags') return envelope({ tags: [toeic] })
      throw new Error(`unexpected ${request.method} ${url.pathname}`)
    })
    app()

    await userEvent.click(await screen.findByRole('radio', { name: t('studyOnboardingGenderFemale') }))
    await userEvent.click(screen.getByRole('button', { name: webText.onboardingNext }))
    const name = screen.getByLabelText(webText.onboardingNameLabel)
    await userEvent.clear(name)
    await userEvent.type(name, '공부하는 수달')
    await userEvent.click(screen.getByRole('button', { name: webText.onboardingNext }))
    await userEvent.click(await screen.findByRole('button', { name: '토익' }))
    await userEvent.click(screen.getByRole('button', { name: webText.onboardingEnter }))

    expect(await screen.findByText(webText.onboardingSaveFailed)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: webText.onboardingGoalTitle })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '토익' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: webText.onboardingEnter }))
    // 저장되면 방으로 걸어 들어간다(카드가 사라지고 건너뛰기만 남는다).
    await waitFor(() => expect(screen.queryByRole('heading', { name: webText.onboardingGoalTitle })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: webText.onboardingSkip })).toBeInTheDocument()
    expect(patchKeys).toHaveLength(2)
    expect(patchKeys[0]).toBeTruthy()
    expect(patchKeys[1]).toBe(patchKeys[0])
    expect(patchBodies[1]).toEqual({ gender: 'female', nickname: '공부하는 수달' })
  })

  it('온보딩을 마친 사람은 다시 들어와도 온보딩을 보지 않는다', async () => {
    setTransport(async (request) => {
      const url = new URL(request.url)
      if (url.pathname === '/auth/session') return envelope({ user: meOf({ completed: '2026-11-23T01:00:00Z', gender: 'male' }), csrf_token: 'c' })
      throw new Error(`unexpected ${request.method} ${url.pathname}`)
    })
    app()
    expect(await screen.findByText('공부 탭')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: t('studyOnboardingGenderTitle') })).not.toBeInTheDocument()
  })

  it('저장은 했지만 둘러보기를 끝내지 않은 사람은 둘러보기부터 본다', async () => {
    setTransport(async (request) => {
      const url = new URL(request.url)
      if (url.pathname === '/auth/session') return envelope({ user: meOf({ gender: 'male' }), csrf_token: 'c' })
      throw new Error(`unexpected ${request.method} ${url.pathname}`)
    })
    app()
    expect(await screen.findByRole('heading', { name: t('studyOnboardingTimerTitle') })).toBeInTheDocument()
  })
})

describe('이름 길이', () => {
  it('이모지·자모 조합도 한 글자로 세어 12자까지 받는다', () => {
    expect(nicknameProblem('🦦'.repeat(12))).toBeNull()
    expect(nicknameProblem('👩‍💻'.repeat(12))).toBe('tooLong')
    expect(nicknameProblem('가'.repeat(12))).toBeNull()
    expect(nicknameProblem('가'.repeat(13))).toBe('tooLong')
    expect(nicknameProblem('   ')).toBe('empty')
  })
})
