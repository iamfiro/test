// 개발 전용: 공부를 끝내지 않고도 공부 인증 카드를 늘 띄워 보는 주소.
//   /?recap=goal   목표 달성(목표 대비 %, "목표 달성" 소인, 연속 12일, 과목 3개)
//   /?recap=more   목표 없음, 어제보다 더 함("어제보다 +n")
//   /?recap=plain  목표 없음, 어제보다 적음, 연속 0일, 과목 없음 기록 하나
// 값은 화면 확인용 표본이다(서버 값 아님). 운영 빌드(import.meta.env.DEV가 false)에서는 아무 일도 하지 않는다.
// 사진은 3D 방이 그려진 뒤 실제로 찍는다(방이 준비될 때까지 기다린다).
import { useEffect } from 'react'
import { logger } from '../../../core/log/log'
import { takeRoomSnapshot } from '../room3d/roomSnapshot'
import { photoSlot } from './cardDraw'
import type { StudyRecap } from './studyRecap'

const log = logger('RecapDemo')

type Variant = 'goal' | 'more' | 'plain'
const variants: readonly Variant[] = ['goal', 'more', 'plain']

function sample(variant: Variant, nickname: string, photo: HTMLCanvasElement | null): StudyRecap {
  const today = new Date()
  const studyDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const base = { nickname, studyDate, serial: 'SV-DEMO-0001', sessionSeconds: 5400, photo }
  switch (variant) {
    case 'goal':
      return { ...base, todaySeconds: 6 * 3600 + 25 * 60, yesterdaySeconds: 4 * 3600, goalSeconds: 6 * 3600, streakDays: 12,
        subjects: [{ subject: 'React 렌더링', seconds: 9600 }, { subject: 'JavaScript 이벤트 루프', seconds: 8100 }, { subject: '브라우저 렌더링 파이프라인', seconds: 5400 }] }
    case 'more':
      return { ...base, todaySeconds: 3 * 3600 + 10 * 60, yesterdaySeconds: 2 * 3600, goalSeconds: null, streakDays: 3,
        subjects: [{ subject: '수학', seconds: 7200 }, { subject: '영어', seconds: 4200 }] }
    case 'plain':
      return { ...base, todaySeconds: 25 * 60, yesterdaySeconds: 3600, goalSeconds: null, streakDays: 0, subjects: [{ subject: null, seconds: 1500 }] }
  }
}

/** 주소에 ?recap=…가 있으면 방이 준비된 뒤 표본 카드를 띄운다. */
export function useRecapDemo(nickname: string | null, show: (recap: StudyRecap) => void): void {
  useEffect(() => {
    if (!import.meta.env.DEV || nickname == null) return
    const value = new URLSearchParams(window.location.search).get('recap')
    if (value == null) return
    if (!variants.includes(value as Variant)) { log.warn('unknown recap demo', { value, known: variants.join('|') }); return }
    const variant = value as Variant
    const started = performance.now()
    let timer = 0
    const tryShow = () => {
      const photo = takeRoomSnapshot(photoSlot.width * 1.25, photoSlot.height * 1.25)
      // 방이 아직 안 그려졌으면 최대 15초까지 기다리고, 그래도 없으면 사진 칸 없이 띄운다.
      if (!photo && performance.now() - started < 15_000) { timer = window.setTimeout(tryShow, 300); return }
      log.debug('recap demo shown', { variant, photo: photo != null, elapsed_ms: Math.round(performance.now() - started) })
      show(sample(variant, nickname, photo))
    }
    // 방이 막 그려진 순간엔 캐릭터가 아직 자리에 없을 수 있어 첫 촬영은 조금 늦춘다.
    timer = window.setTimeout(tryShow, 2500)
    return () => window.clearTimeout(timer)
  }, [nickname, show])
}
