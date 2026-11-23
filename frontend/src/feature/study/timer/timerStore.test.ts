import { describe, expect, it } from 'vitest'
import { elapsedMs, type ActiveSession } from './timerStore'

// 사용자에게 보이는 것: 새로고침하거나 다른 탭에서 열어도 타이머가 서버 세션대로 이어지고,
// 일시정지한 동안은 늘지 않으며, 기기 시계가 틀려도 서버 시각 기준으로 흐른다.
const session = (segments: ActiveSession['segments']): ActiveSession => ({ id: '00000000-0000-4000-8000-000000000009', subject: null, timezone: 'Asia/Seoul', segments })

describe('elapsedMs', () => {
  it('일시정지한 사이는 세지 않는다', () => {
    const s = session([
      { started_at: '2026-11-23T10:00:00Z', ended_at: '2026-11-23T10:10:00Z' },
      { started_at: '2026-11-23T10:30:00Z', ended_at: '2026-11-23T10:35:00Z' },
    ])
    expect(elapsedMs(s, 0, Date.parse('2026-11-23T11:00:00Z'))).toBe(15 * 60_000)
  })

  it('열린 구간은 기기 시계가 아니라 서버 시각까지 센다', () => {
    const s = session([{ started_at: '2026-11-23T10:00:00Z', ended_at: null }])
    // 기기 시계가 서버보다 5분 느리다(offset +5분).
    expect(elapsedMs(s, 5 * 60_000, Date.parse('2026-11-23T10:05:00Z'))).toBe(10 * 60_000)
  })
})
