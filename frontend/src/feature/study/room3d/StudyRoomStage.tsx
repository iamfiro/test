import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSession } from '../../auth/session'
import { StudyRoom3dScenes } from './scenes'
import { StudyRoom3dView, type ActorPlacement, type StudyRoomCinematic } from './StudyRoom3dView'
import { studyRoomCharacterOf } from './participantCharacter'
import { StudyRoomQualityController } from './domain/qualityController'
import { LocalStorageStudyRoomQualityStore } from './infrastructure/localStorageQualityStore'
import type { StudyRoomCameraMode } from './domain/seatCamera'
import { seatPlanMarker } from './SeatPlanMarker'

/** 내 자리(맵 자리 번호). 원본처럼 들어오면 무작위로 정하고, 페이지를 연 동안 탭을 오가도 유지한다. */
let savedSeat: number | null = null

/**
 * 공부 탭의 3D 방(원본 StudyHomePage._room3dBody). 공부방 멤버는 공부방 화면을 붙일 때 더한다.
 * 지금은 나 혼자(원본 릴리스 빌드에서 방을 고르지 않았을 때와 같음).
 */
export function StudyRoomStage(props: {
  cameraMode: StudyRoomCameraMode
  topInset: number
  /** 집중 모드: 내 자리(0번)로 다가가 머리 위·책상 아래에 위젯을 둔다(원본 zoomSeat). */
  focus?: { above: ReactNode; below: ReactNode } | null
  /** 자리 이동 중(카메라가 방 위로 떠 있음). 빈자리를 고르면 잠깐 보여 준 뒤 onClose. */
  seatPlanOpen?: boolean
  onCloseSeatPlan?: () => void
  /** 온보딩 연출(문밖 캐릭터 고르기·걸어 들어오기). */
  cinematic?: StudyRoomCinematic | null
  actorOverlay?: (placement: ActorPlacement) => ReactNode | null
  /** 온보딩: 걸어 들어갈 수 있는 자리 중에서 내 자리를 정한다(맵 자리 번호 목록). */
  seatChoices?: readonly number[] | null
  /** 내 자리(맵 자리 번호)가 정해지거나 바뀌면 알린다. */
  onSeat?: (mapSeat: number) => void
  /** 앉은 사람을 누르면(0번이 나). */
  onPersonTap?: (seat: number) => void
}) {
  const { state } = useSession()
  const me = state.status === 'signedIn' ? state.me : null
  const quality = useMemo(() => {
    const c = new StudyRoomQualityController({ store: new LocalStorageStudyRoomQualityStore() })
    void c.load()
    return c
  }, [])
  const characters = useMemo(
    () => (me ? [studyRoomCharacterOf({ userId: me.id, avatar: me.profile.avatar, gender: me.profile.gender, presence: 'away' })] : []),
    [me],
  )
  const scene = StudyRoom3dScenes.cafe
  const [mine, setMine] = useState(() => (savedSeat ??= Math.floor(Math.random() * scene.seats.length)))
  const choices = props.seatChoices
  useEffect(() => {
    if (!choices || choices.includes(mine)) return
    const next = choices[Math.floor(Math.random() * choices.length)]!
    savedSeat = next
    setMine(next)
  }, [choices, mine])
  const onSeat = useRef(props.onSeat)
  onSeat.current = props.onSeat
  useEffect(() => { onSeat.current?.(mine) }, [mine])
  // 0번이 나인 자리 순서(원본 _seatOrder). 내 자리가 바뀔 때만 새로 만든다.
  const seatMap = useMemo(() => [scene.seats[mine]!, ...scene.seats.filter((_, i) => i !== mine)], [scene, mine])
  // 다른 사람은 남은 자리에 차례로 앉는다(원본 _takenSeats). 지금은 나 혼자라 비어 있다.
  const taken = useMemo(() => {
    const others = scene.seats.map((_, i) => i).filter((i) => i !== mine)
    return new Set(others.slice(0, Math.max(0, characters.length - 1)))
  }, [scene, mine, characters.length])
  const moving = useRef(false)
  // 원본 _moveSeat: 그 자리에 내가 앉는 것을 위에서 잠깐(700ms) 보여 준 뒤 카메라가 내려온다.
  const moveSeat = (seat: number) => {
    if (moving.current) return
    moving.current = true
    savedSeat = seat
    setMine(seat)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => { moving.current = false; props.onCloseSeatPlan?.() }, reduce ? 0 : 700)
  }
  return (
    <StudyRoom3dView
      scene={scene}
      seatMap={seatMap}
      planView={!!props.seatPlanOpen}
      planSeatBuilder={(mapSeat, placement) => seatPlanMarker({ mapSeat, mine, taken, pixelsPerMeter: placement.pixelsPerMeter, onPick: moveSeat })}
      seatCount={characters.length}
      characters={characters}
      cameraMode={props.cameraMode}
      quality={quality}
      topInset={props.topInset}
      seatsAtHead
      zoomSeat={props.focus && characters.length > 0 ? 0 : null}
      zoomAbove={props.focus?.above}
      zoomBelow={props.focus?.below}
      seatBuilder={() => null}
      onSeatTap={props.onPersonTap}
      cinematic={props.cinematic}
      actorOverlay={props.actorOverlay}
      placeholder={<div style={{ position: 'absolute', inset: 0, background: '#F3E1DC' }} />}
    />
  )
}
