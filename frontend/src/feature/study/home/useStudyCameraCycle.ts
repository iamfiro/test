import { useCallback, useEffect, useRef, useState } from 'react'
import { nextCameraMode, type StudyRoomCameraMode } from '../room3d/domain/seatCamera'

/** 원본 `_cycleCamera`: 새 시점 이름을 버튼 옆에 이만큼 보여 준다. */
const hintMs = 1600

/**
 * 원본 StudyHomePage `_roomCamera`·`_cameraHint`·`_cycleCamera`. 누를 때마다 다음 시점으로
 * 바꾸고, 바뀐 시점을 1600ms 동안 힌트로 내놓는다(새로 누르면 다시 센다).
 */
export function useStudyCameraCycle(initial: StudyRoomCameraMode) {
  const [mode, setMode] = useState(initial)
  const [hint, setHint] = useState<StudyRoomCameraMode | null>(null)
  const current = useRef(initial)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const cycle = useCallback(() => {
    const next = nextCameraMode(current.current)
    current.current = next
    setMode(next)
    setHint(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setHint(null), hintMs)
  }, [])

  return { mode, hint, cycle }
}
