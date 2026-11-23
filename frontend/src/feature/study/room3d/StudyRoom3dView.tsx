// 원본: lib/feature/study/room3d/widgets/study_room_3d_view.dart (PocketTime f574f242).
// 3D 방 + 창밖 하늘 + 자리 위 위젯. 언제 다시 그릴지(시점 옮기기·끌기·동작 박자·단계 상한)는
// 원본과 같은 스케줄러가 정하고, 탭이 가려지면 그리지 않는다.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Vector3 } from 'three'
import { StudyRoomCameraRig } from './domain/cameraRig'
import { StudyRoomDaylight } from './domain/daylight'
import { StudyRoomDirector } from './domain/director'
import { StudyRoomQuality } from './domain/quality'
import type { StudyRoomQualityController } from './domain/qualityController'
import { StudyRoomRenderScheduler } from './domain/renderScheduler'
import { StudyRoomSeatCamera, type StudyRoomCameraMode } from './domain/seatCamera'
import { StudyRoomCharacter } from './model/character'
import { colorToHex } from './model/color'
import { StudyRoomLayout } from './model/layout'
import type { StudyRoom3dScene, StudyRoomCamera, StudyRoomSeat } from './model/scene'
import { ThreeStudyRoomRenderer, roomLookFromLocation } from './three/ThreeStudyRoomRenderer'
import { StudyRoomSky } from './StudyRoomSky'

export type SeatPlacement = {
  seat: number
  anchor: { x: number; y: number }
  head: { x: number; y: number }
  pixelsPerMeter: number
}

type Frame = { modeBlend: number; zoom: number; motionSeconds: number; orbit: number; cameraSeconds: number }
/** 다가간 자리 위·아래 위젯 위치(px). above는 아래 끝, below는 위 끝. landscape면 양옆. */
type ZoomSpots = { t: number; landscape: boolean; above: { x: number; y: number }; below: { x: number; y: number } } | null

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
/** 끌기 1px당 도는 각도. */
const orbitPerPixel = 0.35
/** 시점 바꾸기 시간(공부하며 보는 화면이라 천천히). */
const modeMs = 1600
/** 집중 모드로 다가가기·물러나기 시간. */
const zoomMs = 650
/** 다가갔을 때 화면 세로에 꼭 담겨야 하는 장면 높이(m): 머리 위부터 책상 앞까지. */
const zoomSpanMeters = 1.7

export function StudyRoom3dView(props: {
  scene: StudyRoom3dScene
  seatCount: number
  characters: readonly (StudyRoomCharacter | null)[]
  seatMap?: readonly StudyRoomSeat[]
  cameraMode: StudyRoomCameraMode
  viewerSeat?: number
  quality: StudyRoomQualityController | null
  topInset?: number
  seatsAtHead?: boolean
  seatBuilder: (placement: SeatPlacement) => ReactNode | null
  placeholder: ReactNode
  onSeatTap?: (seat: number) => void
  /** 집중 모드: 이 자리로 다가가 머리 위에 zoomAbove, 책상 아래에 zoomBelow를 둔다. */
  zoomSeat?: number | null
  zoomAbove?: ReactNode
  zoomBelow?: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  // 렌더러는 마운트마다 새로 만들고 해제한다(StrictMode의 두 번 실행에도 안전).
  const [renderer, setRenderer] = useState<ThreeStudyRoomRenderer | null>(null)
  const [phase, setPhase] = useState<ThreeStudyRoomRenderer['phase']>('idle')
  const [daylight, setDaylight] = useState(() => StudyRoomDaylight.now())
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [zoomSpots, setZoomSpots] = useState<ZoomSpots>(null)
  const [placements, setPlacements] = useState<{ list: SeatPlacement[]; built: { p: SeatPlacement; node: ReactNode }[] }>({ list: [], built: [] })
  const viewerSeat = props.viewerSeat ?? 0
  const reduceMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const r = new ThreeStudyRoomRenderer(roomLookFromLocation())
    el.prepend(r.canvas)
    const unsubscribe = r.subscribe(() => setPhase(r.phase))
    setRenderer(r)
    void r.load(props.scene)
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => { ro.disconnect(); unsubscribe(); r.canvas.remove(); r.dispose(); setRenderer(null) }
    // 장면은 마운트 동안 바뀌지 않는다(맵을 바꾸면 새 뷰).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 하루 분위기: 기기 시각에 맞춰 1분마다 다시 잰다(원본 홈 화면 주기 갱신).
  useEffect(() => {
    const id = window.setInterval(() => setDaylight(StudyRoomDaylight.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => { renderer?.setLook(daylight.look); renderer?.setDaylight(daylight) }, [renderer, daylight])

  const layout = useMemo(
    () => new StudyRoomLayout({ mapSeats: props.seatMap ?? props.scene.seats, seats: props.seatCount }),
    [props.seatMap, props.scene, props.seatCount],
  )
  useEffect(() => { renderer?.setLayout(layout, props.characters) }, [renderer, layout, props.characters])

  // ---- 박자 ----
  const state = useRef({
    fromMode: props.cameraMode,
    mode: props.cameraMode,
    modeStarted: null as number | null,
    orbit: 0,
    cameraSeconds: 0,
    cameraTickedAt: null as number | null,
    motionMs: 0,
    motionMeasuredAt: null as number | null,
    lastFrame: null as Frame | null,
    zoomFrom: props.zoomSeat != null ? 1 : 0,
    zoomTo: props.zoomSeat != null ? 1 : 0,
    zoomStarted: null as number | null,
    zoomedSeat: props.zoomSeat ?? null,
  })
  const scheduler = useMemo(() => new StudyRoomRenderScheduler({ capHz: StudyRoomQuality.high.renderHz, motionFps: StudyRoomQuality.high.motionFps }), [])
  const latest = useRef(props)
  latest.current = props
  const kick = useRef<() => void>(() => {})

  // 시점 바꾸기: 앞 시점에서 1600ms에 걸쳐 옮긴다. 자동 연출은 첫 장면부터.
  useEffect(() => {
    const s = state.current
    if (s.mode === props.cameraMode) return
    s.fromMode = s.mode
    s.mode = props.cameraMode
    s.modeStarted = reduceMotion ? null : performance.now()
    if (props.cameraMode === 'auto') s.cameraSeconds = 0
    scheduler.invalidateCamera()
    kick.current()
  }, [props.cameraMode, reduceMotion, scheduler])

  // 집중 모드: 650ms에 걸쳐 다가가고 물러난다(물러날 때는 마지막 자리를 기억한다).
  useEffect(() => {
    const s = state.current
    const to = props.zoomSeat != null ? 1 : 0
    if (props.zoomSeat != null) s.zoomedSeat = props.zoomSeat
    if (s.zoomTo === to) return
    s.zoomFrom = currentZoom(s, performance.now())
    s.zoomTo = to
    s.zoomStarted = reduceMotion ? null : performance.now()
    scheduler.invalidateCamera()
    kick.current()
  }, [props.zoomSeat, reduceMotion, scheduler])

  useEffect(() => {
    if (!renderer || phase !== 'ready' || size.width === 0) return
    const quality = props.quality
    let raf = 0
    let wake: number | undefined
    let visible = document.visibilityState === 'visible'

    const currentQuality = () => quality?.quality ?? StudyRoomQuality.high

    const syncScheduler = () => {
      const q = currentQuality()
      const animate = renderer.drawsCharacters && latest.current.characters.some((c) => c != null) && !reduceMotion
      if (scheduler.capHz !== q.renderHz || scheduler.motionFps !== q.motionFps || scheduler.animating !== (animate && q.motionFps > 0)) {
        const was = scheduler.animating
        scheduler.configure({ capHz: q.renderHz, motionFps: q.motionFps, animating: animate })
        if (scheduler.animating !== was) state.current.motionMeasuredAt = null
      }
    }

    const schedule = () => {
      if (!visible || raf) return
      raf = requestAnimationFrame(pump)
    }
    kick.current = schedule

    const pump = (now: number) => {
      raf = 0
      window.clearTimeout(wake)
      if (!visible) return
      const s = state.current
      syncScheduler()
      // 움직이는 시점의 연출 시계(그 시점이고 보일 때만 흐른다).
      if (StudyRoomDirector.moves(s.mode) && !reduceMotion) {
        if (s.cameraTickedAt != null) s.cameraSeconds += Math.min(0.1, Math.max(0, (now - s.cameraTickedAt) / 1000))
        s.cameraTickedAt = now
        scheduler.invalidateCamera()
      } else {
        s.cameraTickedAt = null
      }
      // 동작 시계: 재생 중이고 보이는 동안만.
      if (scheduler.animating) {
        if (s.motionMeasuredAt != null && now > s.motionMeasuredAt) s.motionMs += now - s.motionMeasuredAt
        s.motionMeasuredAt = now
      } else {
        s.motionMeasuredAt = null
      }
      let modeBlend = 1
      if (s.modeStarted != null) {
        const t = Math.min(1, (now - s.modeStarted) / modeMs)
        modeBlend = easeInOutCubic(t)
        if (t >= 1) s.modeStarted = null
        scheduler.invalidateCamera()
      }
      const zoom = easeInOutCubic(currentZoom(s, now))
      if (s.zoomStarted != null) {
        if (now - s.zoomStarted >= zoomMs) s.zoomStarted = null
        scheduler.invalidateCamera()
      }
      if (scheduler.needsRender(s.motionMs)) {
        const wait = scheduler.untilCapAllows(now)
        if (wait > 0) {
          wake = window.setTimeout(schedule, wait)
          return
        }
        const motionFrame = scheduler.motionFrameAt(s.motionMs)
        const frame: Frame = { modeBlend, zoom, motionSeconds: scheduler.motionSecondsOf(motionFrame), orbit: s.orbit, cameraSeconds: s.cameraSeconds }
        draw(frame, now)
        scheduler.didRender({ frameTimeMs: now, motionFrame })
      }
      if (s.modeStarted != null || s.zoomStarted != null || StudyRoomDirector.moves(s.mode)) { schedule(); return }
      const next = scheduler.untilNextMotionFrame(s.motionMs)
      if (next != null) wake = window.setTimeout(schedule, next)
    }

    const draw = (frame: Frame, now: number) => {
      const p = latest.current
      const zoomSeat = state.current.zoomedSeat != null && state.current.zoomedSeat < layout.seatCount ? state.current.zoomedSeat : null
      const base = cameraFor(p.scene, layout, size, frame, state.current.fromMode, state.current.mode, viewerSeat)
      const camera = frame.zoom === 0 || zoomSeat == null
        ? base
        : StudyRoomSeatCamera.lerp(base, focusCamera(layout.seat(zoomSeat), size, p.topInset ?? 0), frame.zoom)
      const hiddenSeat = frame.zoom > 0 ? null : hiddenSeatOf(frame, state.current.fromMode, state.current.mode, viewerSeat)
      setZoomSpots(zoomSeat == null || frame.zoom === 0 ? null : zoomSpotsOf(layout, zoomSeat, camera, size, frame.zoom))
      const result = renderer.render({
        camera,
        width: size.width,
        height: size.height,
        devicePixelRatio: window.devicePixelRatio || 1,
        motionSeconds: frame.motionSeconds,
        quality: currentQuality(),
        hiddenSeat,
        cutHeight: 0,
      })
      if (result && quality?.isWatching) quality.onTimings([{ atMs: now, buildMs: 0, rasterMs: result.ms }])
      setPlacements(placeSeats(p, layout, camera, size, hiddenSeat ?? -1))
    }

    const onVisibility = () => {
      visible = document.visibilityState === 'visible'
      state.current.motionMeasuredAt = null
      state.current.cameraTickedAt = null
      if (visible) { quality?.startWatching(); scheduler.invalidateCamera(); schedule() } else { quality?.stopWatching(); cancelAnimationFrame(raf); raf = 0; window.clearTimeout(wake) }
    }
    document.addEventListener('visibilitychange', onVisibility)
    const onQuality = () => { scheduler.invalidateCamera(); schedule() }
    quality?.addListener(onQuality)
    const unsubscribeRenderer = renderer.subscribe(() => { scheduler.invalidateCamera(); schedule() })
    if (visible) quality?.startWatching()
    scheduler.invalidateCamera()
    schedule()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      quality?.removeListener(onQuality)
      unsubscribeRenderer()
      quality?.stopWatching()
      cancelAnimationFrame(raf)
      window.clearTimeout(wake)
      kick.current = () => {}
    }
  }, [phase, size, layout, renderer, scheduler, props.quality, reduceMotion, viewerSeat])

  // 3인칭: 좌우로 끌어 카메라를 내 자리 둘레로 돌린다.
  const drag = useRef<number | null>(null)
  const canOrbit = props.cameraMode === 'thirdPerson'
  const onPointerDown = (e: React.PointerEvent) => { if (canOrbit) drag.current = e.clientX }
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current == null) return
    const dx = e.clientX - drag.current
    drag.current = e.clientX
    const s = state.current
    s.orbit = (((s.orbit - dx * orbitPerPixel) % 360) + 360) % 360
    scheduler.invalidateCamera()
    kick.current()
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const moved = drag.current != null && Math.abs(e.clientX - drag.current) > 4
    drag.current = null
    if (!moved && props.onSeatTap && host.current) {
      const rect = host.current.getBoundingClientRect()
      const hit = seatAt(placements.list, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      if (hit != null) props.onSeatTap(hit)
    }
  }

  if (phase === 'failed') return <>{props.placeholder}</>
  return (
    <div
      ref={host}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: canOrbit ? 'pan-y' : 'auto', background: colorToHex(props.scene.backdrop) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null }}
    >
      <StudyRoomSky daylight={daylight} />
      {phase === 'ready' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
          {placements.built.map(({ p, node }) => {
            const at = props.seatsAtHead ? p.head : p.anchor
            return (
              <div key={p.seat} style={{ position: 'absolute', left: at.x, top: at.y, transform: 'translate(-50%, -100%)' }}>
                {node}
              </div>
            )
          })}
        </div>
      )}
      {phase === 'ready' && zoomSpots && (
        <ZoomOverlays spots={zoomSpots} above={props.zoomAbove} below={props.zoomBelow} />
      )}
    </div>
  )
}

/** 다가간 정도(0–1, 곡선 전). */
function currentZoom(s: { zoomFrom: number; zoomTo: number; zoomStarted: number | null }, now: number): number {
  if (s.zoomStarted == null) return s.zoomTo
  const t = Math.min(1, (now - s.zoomStarted) / zoomMs)
  return s.zoomFrom + (s.zoomTo - s.zoomFrom) * t
}

const isLandscape = (size: { width: number; height: number }) => size.width > size.height

/**
 * 집중 모드 구도(원본 _focusCamera): 머리 위 시점에서 더 다가가, 사람·책상과 위아래 위젯이 화면을
 * 벗어나지 않게 한다. 세로 화면은 위·아래 위젯 자리(280)까지, 가로 화면은 여백(32)만 비운다.
 */
function focusCamera(seat: StudyRoomSeat, size: { width: number; height: number }, topInset: number): StudyRoomCamera {
  const top = StudyRoomSeatCamera.focusBase(seat, size)
  const focus = seat.anchor.add(new Vector3(0, 0.3, 0)).add(seat.facing.multiplyScalar(0.3))
  const reserve = topInset + (isLandscape(size) ? 32 : 280)
  const room = Math.max(1, size.height - reserve)
  const needed = (zoomSpanMeters * size.height) / room
  const height = new StudyRoomCameraRig(top, size).visibleHeight
  const width = top.viewWidth * Math.min(1.4, Math.max(0.5, needed / height))
  return top.copyWith({ target: focus, viewWidth: width })
}

/** 원본 _zoomOverlays 위치: 세로는 머리 위·책상 아래, 가로는 사람 왼쪽·오른쪽. */
function zoomSpotsOf(layout: StudyRoomLayout, seatIndex: number, camera: StudyRoomCamera, size: { width: number; height: number }, t: number): ZoomSpots {
  const rig = new StudyRoomCameraRig(camera, size)
  const seat = layout.seat(seatIndex)
  const anchor = seat.anchor
  const head = rig.project(anchor.clone().add(new Vector3(0, StudyRoomCharacter.headTopMeters - 0.2, 0)))
  const desk = rig.project(layout.deskFront(seatIndex).add(seat.facing.multiplyScalar(0.2)))
  if (!head || !desk) return null
  const crown = rig.project(anchor.clone().add(new Vector3(0, StudyRoomCharacter.headTopMeters + 0.1, 0)).add(seat.facing.multiplyScalar(0.34))) ?? head
  if (isLandscape(size)) {
    const body = rig.project(anchor.clone().add(new Vector3(0, 0.45, 0)))
    const side = rig.project(anchor.clone().add(new Vector3(0.6, 0.45, 0)))
    if (body && side) {
      const half = Math.abs(side.x - body.x)
      return { t, landscape: true, above: { x: body.x - half - 16, y: body.y }, below: { x: body.x + half + 16, y: body.y } }
    }
  }
  return { t, landscape: false, above: { x: size.width / 2, y: crown.y }, below: { x: size.width / 2, y: Math.max(desk.y, head.y + 140) } }
}

/** 거의 다 다가갔을 때 나타나고, 물러날 때는 먼저 사라진다. 다 다가가기 전에는 누를 수 없다. */
function ZoomOverlays(props: { spots: NonNullable<ZoomSpots>; above?: ReactNode; below?: ReactNode }) {
  const { spots } = props
  const opacity = Math.min(1, Math.max(0, (spots.t - 0.5) / 0.5))
  const live = spots.t >= 1
  const common = { position: 'absolute' as const, opacity, pointerEvents: live ? ('auto' as const) : ('none' as const), zIndex: 4 }
  if (spots.landscape) {
    return (
      <>
        {props.above && <div style={{ ...common, right: `calc(100% - ${spots.above.x}px)`, top: spots.above.y, transform: 'translateY(-50%)' }}>{props.above}</div>}
        {props.below && <div style={{ ...common, left: spots.below.x, top: spots.below.y, transform: 'translateY(-50%)' }}>{props.below}</div>}
      </>
    )
  }
  return (
    <>
      {props.above && <div style={{ ...common, left: 0, right: 0, bottom: `calc(100% - ${spots.above.y}px)`, display: 'flex', justifyContent: 'center' }}>{props.above}</div>}
      {props.below && <div style={{ ...common, left: 0, right: 0, top: spots.below.y, display: 'flex', justifyContent: 'center' }}>{props.below}</div>}
    </>
  )
}

/** 지금 그릴 카메라: 앞 시점 → 지금 시점 사이. (다가가기·위에서 보기는 해당 화면에서 붙인다.) */
function cameraFor(
  scene: StudyRoom3dScene,
  layout: StudyRoomLayout,
  size: { width: number; height: number },
  frame: Frame,
  fromMode: StudyRoomCameraMode,
  mode: StudyRoomCameraMode,
  viewerSeat: number,
): StudyRoomCamera {
  if (viewerSeat >= layout.seatCount) return scene.camera
  const seats = [layout.seat(viewerSeat)]
  for (let i = 0; i < layout.seatCount; i++) if (i !== viewerSeat) seats.push(layout.seat(i))
  const shot = (m: StudyRoomCameraMode) =>
    StudyRoomDirector.shot(m, { seats, size, interior: scene.interior, seconds: frame.cameraSeconds, orbitDegrees: frame.orbit })
  const now = shot(mode)
  return frame.modeBlend >= 1 ? now : StudyRoomDirector.blend(shot(fromMode), now, frame.modeBlend, size, scene.interior)
}

/** 1인칭 쪽으로 반 넘게 옮겨 간 동안은 내 캐릭터를 그리지 않는다(카메라가 머리 안). */
function hiddenSeatOf(frame: Frame, fromMode: StudyRoomCameraMode, mode: StudyRoomCameraMode, viewerSeat: number): number | null {
  const nearFirst = frame.modeBlend >= 0.5 ? mode === 'firstPerson' : fromMode === 'firstPerson'
  return nearFirst ? viewerSeat : null
}

function placeSeats(
  props: { seatBuilder: (p: SeatPlacement) => ReactNode | null; seatsAtHead?: boolean },
  layout: StudyRoomLayout,
  camera: StudyRoomCamera,
  size: { width: number; height: number },
  hidden: number,
) {
  const rig = new StudyRoomCameraRig(camera, size)
  const list: SeatPlacement[] = []
  const built: { p: SeatPlacement; node: ReactNode }[] = []
  for (let seat = 0; seat < layout.seatCount; seat++) {
    if (seat === hidden) continue
    const anchor3d = layout.seatAnchor(seat)
    const anchor = rig.project(anchor3d)
    const top = rig.project(anchor3d.clone().add(new Vector3(0, 1, 0)))
    if (!anchor || !top) continue
    if (anchor.y < -size.height * 0.3 || anchor.y > size.height * 1.3 || anchor.x < -size.width * 0.3 || anchor.x > size.width * 1.3) continue
    const facing = layout.seat(seat).facing
    const head = rig.project(anchor3d.clone().add(new Vector3(0, StudyRoomCharacter.headTopMeters, 0)).add(facing.clone().multiplyScalar(0.12))) ?? anchor
    const p: SeatPlacement = { seat, anchor, head, pixelsPerMeter: Math.max(1, Math.hypot(anchor.x - top.x, anchor.y - top.y)) }
    const node = props.seatBuilder(p)
    if (node == null) continue
    list.push(p)
    built.push({ p, node })
  }
  // 칩이 서로 덮지 않게: 앞(가까운) 사람부터 놓고, 이미 놓은 칩을 12% 넘게 덮는 뒤쪽 칩은 그리지 않는다.
  built.sort((a, b) => b.p.pixelsPerMeter - a.p.pixelsPerMeter)
  const taken: { l: number; t: number; r: number; b: number }[] = []
  const shown: typeof built = []
  for (const item of built) {
    if (props.seatsAtHead) {
      const at = item.p.head
      const chip = { l: at.x - 56, t: at.y - 36, r: at.x + 56, b: at.y }
      const area = (chip.r - chip.l) * (chip.b - chip.t)
      const crowded = taken.some((r) => {
        const w = Math.min(r.r, chip.r) - Math.max(r.l, chip.l)
        const h = Math.min(r.b, chip.b) - Math.max(r.t, chip.t)
        return w > 0 && h > 0 && w * h > area * 0.12
      })
      if (crowded) continue
      taken.push(chip)
    }
    shown.push(item)
  }
  return { list, built: shown }
}

/** 원본 studyRoomSeatAt: 머리 위 칩부터 방석 조금 아래까지, 몸 폭(0.7m, 최소 44px) 상자. 겹치면 가까운 사람. */
function seatAt(placements: SeatPlacement[], point: { x: number; y: number }): number | null {
  let best: SeatPlacement | null = null
  for (const p of placements) {
    const width = Math.max(44, p.pixelsPerMeter * 0.7)
    const top = Math.min(p.head.y, p.anchor.y) - 36
    const bottom = Math.max(p.head.y, p.anchor.y) + 12
    const center = (p.head.x + p.anchor.x) / 2
    if (point.x < center - width / 2 || point.x > center + width / 2 || point.y < top || point.y > bottom) continue
    if (!best || p.pixelsPerMeter > best.pixelsPerMeter) best = p
  }
  return best?.seat ?? null
}
