import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setTransport } from '../../../core/api/client'
import { ToastProvider } from '../../../core/ui/Toast'
import { tagText } from '../../../l10n/web_tags_ko'
import { MyTagsSheet } from './MyTagsSheet'
import type { Tag } from './tagsStore'

// 사용자에게 보이는 것: 태그 저장이 실패하면 고른 태그가 그대로 남고 이유가 뜨며, 다시 눌러도 서버에는
// 한 번만 적용된다(같은 Idempotency-Key). 성공하면 시트가 닫힌다.
const suneung: Tag = { id: 't1', kind: 'exam', name: '수능' }
const toeic: Tag = { id: 't3', kind: 'exam', name: '토익' }
const envelope = (data: unknown) => new Response(JSON.stringify({ data, error: null, meta: { requestId: 'r', timestamp: '2026-11-23T00:00:00Z' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })

afterEach(cleanup)

describe('MyTagsSheet', () => {
  it('저장이 실패하면 고른 태그를 지키고, 다시 저장할 때 같은 키를 쓴다', async () => {
    const putKeys: (string | null)[] = []
    let failNext = true
    setTransport(async (request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/tags') return envelope({ tags: [suneung, toeic] })
      if (request.method === 'PUT' && url.pathname === '/users/me/tags') {
        putKeys.push(request.headers.get('Idempotency-Key'))
        if (failNext) { failNext = false; throw new TypeError('network down') }
        return envelope({ tags: [suneung, toeic] })
      }
      throw new Error(`unexpected ${request.method} ${url.pathname}`)
    })
    let closed = false
    render(<ToastProvider><MyTagsSheet initial={[suneung]} onDismiss={() => { closed = true }} /></ToastProvider>)

    await userEvent.click(await screen.findByRole('button', { name: '토익' }))
    await userEvent.click(screen.getByRole('button', { name: tagText.tagsSave }))

    expect(await screen.findByText(tagText.tagsSaveFailed)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: tagText.tagRemove('토익') })).toBeInTheDocument()
    expect(closed).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: tagText.tagsSave }))
    await waitFor(() => expect(closed).toBe(true))
    expect(putKeys).toHaveLength(2)
    expect(putKeys[0]).toBeTruthy()
    expect(putKeys[1]).toBe(putKeys[0])
  })
})
