// 공부 화면과 사운드 연결: 처음 들어오면 마지막 소리를 틀고(원본 playOnEntry, 페이지를 연 뒤 한 번),
// 타이머가 멈추면 같이 멈추고 같은 세션을 다시 시작하면 다시 튼다(원본 StudySoundTimerBinding).
import { useEffect, useRef } from 'react'
import { t } from '../../../l10n/t'
import { useToast } from '../../../core/ui/Toast'
import { isRunning, useTimer } from '../timer/timerStore'
import { isPlaying, playOnEntry, timerChanged, useSound } from './soundStore'

let entered = false

export function useStudySound(active: boolean) {
  const sound = useSound()
  const toast = useToast()
  const { session, loaded } = useTimer()
  useEffect(() => {
    if (!active || entered) return
    entered = true
    playOnEntry()
  }, [active])
  const next = { id: session?.id ?? null, running: session != null && isRunning(session) }
  const prev = useRef(next)
  useEffect(() => {
    // 처음 읽은 세션은 변화가 아니다(복원만으로 소리를 끄거나 켜지 않는다).
    if (!loaded) { prev.current = next; return }
    if (prev.current.id !== next.id || prev.current.running !== next.running) timerChanged(prev.current, next)
    prev.current = next
  }, [loaded, next.id, next.running])
  useEffect(() => {
    if (sound.error === 'playback') toast(t('studySoundPlayFailed'), { type: 'error' })
  }, [sound.error])
  return { playing: isPlaying(sound) }
}
