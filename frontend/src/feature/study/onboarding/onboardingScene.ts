// 온보딩 3D 연출(웹 전용, 사용자 결정 2026-11-23). 카페 방(v2) 서쪽 문밖 잔디에서 캐릭터를 고르고,
// 고른 캐릭터가 문으로 걸어 들어가 내 자리에 앉는 것을 카메라가 따라간다.
// 좌표는 방 GLB(glTF, Y 위) 그대로다. 문·바닥 높이는 tool/blender/study_room/build_study_room_v2.py에서 읽었다:
// 서쪽 벽(x -0.1) 문 y 5.2–6.4(glTF z -5.2–-6.4), 방 바닥 윗면 0, 바깥 잔디 윗면 -0.35, 바닥판 가장자리 x -0.2.
import { MathUtils, Vector3 } from 'three'
import { StudyRoomCamera, type StudyRoomSeat } from '../room3d/model/scene'
import { StudyRoomSeatCamera } from '../room3d/domain/seatCamera'
import { StudyRoomPose } from '../room3d/domain/motion'
import { idleMotion, lookUpAt, selectMotion, selectSeconds, standingLift, standingPose, walkBob, walkingPose } from '../room3d/domain/actorMotion'
import type { StudyRoomCharacter } from '../room3d/model/character'
import type { StudyRoomActor } from '../room3d/three/ThreeStudyRoomRenderer'
import type { StudyRoomCinematicFrame } from '../room3d/StudyRoom3dView'

export type Gender = 'male' | 'female'
type Size = { width: number; height: number }

const doorZ = -5.8
const lawnY = -0.35
const floorY = 0
/** 바닥판 가장자리(여기부터 방 바닥 높이). 그 앞 0.25m에서 한 단 올라선다. */
const floorEdgeX = -0.2
const standX = -2.0
/** 남자는 화면 왼쪽(카메라가 +X를 보면 +Z가 화면 오른쪽). */
const pickZ: Record<Gender, number> = { male: doorZ - 0.3, female: doorZ + 0.3 }
/** 카메라를 보는 쪽(-X). */
const faceCamera = -Math.PI / 2
const walkSpeed = 1.25
const stepsPerMeter = 2.2

export type OnboardingStep = 'pick' | 'name' | 'goal' | 'enter'

type ActorState = { x: number; z: number; yaw: number; phase: number; walk: number; selectAt: number | null; look: number }

const groundAt = (x: number) => (x >= floorEdgeX ? floorY : x <= floorEdgeX - 0.25 ? lawnY : lawnY + ((x - (floorEdgeX - 0.25)) / 0.25) * (floorY - lawnY))
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
const smooth = (t: number) => t * t * (3 - 2 * t)

/** 캐릭터를 둘 화면 칸(px): 위 진행 표시 아래부터 온보딩 카드 위까지. */
export type FreeArea = { top: number; bottom: number }
/** 문밖 카메라가 캐릭터에서 물러나는 최대 거리(m). 이보다 멀면 잔디 위 나무·바위가 앞을 가린다. */
const maxFrontDistance = 5.5

/**
 * 문밖에서 캐릭터를 바라보는 카메라(사람 얼굴 쪽). 캐릭터 가운데(mid)가 화면 칸 free 가운데에 오고, 세로 height(m)는
 * 그 칸에, 가로 span(m)은 화면 폭에 다 들어오게 한다. 눈높이는 캐릭터보다 조금 위로 두고, 칸이 화면 위쪽에 있으면
 * 그만큼 내려다본다(초점을 내리면 눈이 땅속으로 들어간다). 칸이 작으면 물러나는 대신 화각을 넓힌다.
 */
function frontCamera(mid: Vector3, height: number, span: number, size: Size, free: FreeArea): StudyRoomCamera {
  const aspect = size.width / size.height
  const freeHeight = Math.max(80, free.bottom - free.top)
  const visibleHeight = Math.max((height * size.height) / freeHeight, span / aspect)
  const distance = Math.min(maxFrontDistance, visibleHeight / (2 * Math.tan(MathUtils.degToRad(15))))
  const fovRad = 2 * Math.atan(visibleHeight / (2 * distance))
  const eyeY = mid.y + 0.35
  const offset = (size.height / 2 - (free.top + free.bottom) / 2) / (size.height / 2)
  const down = Math.atan2(eyeY - mid.y, distance) + Math.atan(offset * Math.tan(fovRad / 2))
  const along = distance / Math.cos(down)
  // 카메라는 +X를 본다(yaw -90°).
  const eye = new Vector3(mid.x - distance, eyeY, mid.z)
  const target = eye.clone().add(new Vector3(Math.cos(down), -Math.sin(down), 0).multiplyScalar(along))
  return new StudyRoomCamera({
    projection: 'perspective',
    pitchDegrees: MathUtils.radToDeg(down),
    yawDegrees: MathUtils.radToDeg(faceCamera),
    fovYDegrees: MathUtils.radToDeg(fovRad),
    target,
    viewWidth: 2 * along * Math.tan(fovRad / 2) * aspect,
    minViewHeight: 0,
  })
}

/** 걷는 사람 뒤 위에서 따라가는 카메라(3인칭과 같은 각도·화각). */
function followCamera(x: number, y: number, z: number, heading: number, size: Size): StudyRoomCamera {
  const fov = 52
  const distance = 2.6
  const aspect = size.width / size.height
  const facing = new Vector3(Math.sin(heading), 0, Math.cos(heading))
  return new StudyRoomCamera({
    projection: 'perspective',
    pitchDegrees: 34,
    yawDegrees: MathUtils.radToDeg(heading) + 180,
    fovYDegrees: fov,
    target: new Vector3(x, y + 0.45, z).add(facing.multiplyScalar(0.5)),
    viewWidth: distance * 2 * Math.tan(MathUtils.degToRad(fov) / 2) * aspect,
    minViewHeight: 0,
  })
}

/**
 * 문에서 내 자리까지 걷는 길(바닥 위 점들). 홀 가운데 공용 테이블(자리 0–11)·남쪽 개인 책상(12–18)만 잇는다.
 * 테이블 북쪽 통로(z -5.45), 테이블 사이 통로(z -1.75), 테이블 서쪽 끝(x 1.7)과 동쪽 끝(x 9.4)으로 돈다.
 * 의자 뒤 0.55m에서 자리 쪽으로 돌아 앉는다.
 */
export function entrancePath(seat: StudyRoomSeat): Vector3[] {
  const behind = seat.anchor.clone().sub(seat.facing.multiplyScalar(0.55))
  const pts: [number, number][] = [[floorEdgeX - 0.6, doorZ], [0.7, doorZ], [1.4, -5.45]]
  if (behind.z < -3.4) {
    pts.push([behind.x, -5.45])
  } else {
    const viaX = seat.x < 5.4 ? 1.7 : 9.4
    pts.push([viaX, -5.45], [viaX, -1.75], [behind.x, -1.75])
  }
  pts.push([behind.x, behind.z])
  return pts.map(([x, z]) => new Vector3(x, 0, z))
}

/** 온보딩 연출에 쓸 수 있는 자리(entrancePath가 잇는 자리). */
export const entranceSeats = Array.from({ length: 19 }, (_, i) => i)

export class OnboardingScene {
  private step: OnboardingStep = 'pick'
  private gender: Gender | null = null
  private readonly actors: Record<Gender, ActorState> = {
    male: { x: standX, z: pickZ.male, yaw: faceCamera, phase: 0, walk: 0, selectAt: null, look: 0 },
    female: { x: standX, z: pickZ.female, yaw: faceCamera, phase: 0, walk: 0, selectAt: null, look: 0 },
  }
  private camera: StudyRoomCamera | null = null
  private lastMs: number | null = null
  private enter: { seat: StudyRoomSeat; path: Vector3[]; startedMs: number | null; heading: number; onSeated: () => void; seated: boolean; doneMs: number | null } | null = null

  constructor(
    private readonly characters: Record<Gender, StudyRoomCharacter>,
    private readonly reduceMotion: boolean,
  ) {}

  private freeArea: FreeArea | null = null
  /** 온보딩 카드가 자리를 바꾸면 알린다(카드 높이가 단계마다 다르다). */
  setFreeArea(area: FreeArea) { this.freeArea = area }
  private free(size: Size): FreeArea { return this.freeArea ?? { top: 64, bottom: size.height * 0.6 } }

  set(step: OnboardingStep, gender: Gender | null) {
    if (gender !== this.gender && gender && step === 'pick') this.actors[gender].selectAt = null
    if (gender !== this.gender && gender) this.actors[gender].selectAt = -1
    this.step = step
    this.gender = gender
  }

  /** 4단계: 고른 캐릭터가 문으로 걸어 들어가 seat에 앉는다. 앉으면 onSeated. */
  startEntrance(seat: StudyRoomSeat, onSeated: () => void) {
    const a = this.gender ? this.actors[this.gender] : null
    if (!a) return
    const path = [new Vector3(a.x, 0, a.z), ...entrancePath(seat)]
    this.step = 'enter'
    this.enter = { seat, path, startedMs: null, heading: a.yaw, onSeated, seated: false, doneMs: null }
  }

  /** 걸어 들어가기를 건너뛴다(바로 앉은 장면). */
  skipEntrance() {
    if (!this.enter || this.enter.seated) return
    this.enter.seated = true
    this.enter.doneMs = -Infinity
    this.enter.onSeated()
  }

  readonly frame = (nowMs: number, size: Size): StudyRoomCinematicFrame | null => {
    const dt = this.lastMs == null ? 0 : Math.min(0.1, Math.max(0, (nowMs - this.lastMs) / 1000))
    this.lastMs = nowMs
    if (this.step === 'enter' && this.enter) return this.enterFrame(nowMs, dt, size)
    const t = nowMs / 1000
    const chosen = this.gender
    const actors: StudyRoomActor[] = []
    for (const g of ['male', 'female'] as const) {
      if (this.step !== 'pick' && g !== chosen) continue
      const a = this.actors[g]
      const target = this.step === 'pick' ? { x: g === chosen ? standX + 0.4 : standX, z: pickZ[g] } : { x: standX + 0.4, z: doorZ }
      this.moveToward(a, target.x, target.z, faceCamera, dt)
      // 이름 정하기: 머리 위 이름표를 의식하듯 올려다본다(줄인 움직임이면 바로).
      const wantLook = this.step === 'name' && g === chosen ? 1 : 0
      a.look = this.reduceMotion ? wantLook : a.look + (wantLook - a.look) * Math.min(1, dt * 4)
      // 고른 동작은 한 걸음 앞으로 나와 멈춘 뒤에 시작한다.
      if (a.selectAt === -1 && a.walk < 0.05) a.selectAt = nowMs
      actors.push(this.actorOf(g, a, t, nowMs, this.step === 'pick' && g === chosen ? 1.06 : 1))
    }
    const focus = this.step === 'pick'
      // 두 캐릭터와 발밑 이름 알약.
      ? frontCamera(new Vector3(standX + 0.2, lawnY + 0.5, doorZ), 0.95, 1.5, size, this.free(size))
      // 머리 위 이름표(목표 단계는 태그까지)가 칸 안에 들어오게 위를 더 남긴다.
      : frontCamera(new Vector3(standX + 0.4, lawnY + (this.step === 'goal' ? 0.68 : 0.62), doorZ), this.step === 'goal' ? 1.0 : 1.1, 0.8, size, this.free(size))
    this.camera = this.camera && !this.reduceMotion ? StudyRoomSeatCamera.lerp(this.camera, focus, 1 - Math.exp(-dt * 4)) : focus
    return { camera: this.camera, actors, hiddenSeat: 0 }
  }

  private actorOf(g: Gender, a: ActorState, t: number, nowMs: number, scale: number): StudyRoomActor {
    // 둘이 같이 움직이지 않게 사람마다 시작 시각을 달리한다. 줄인 움직임 설정이면 가만히 선 채로.
    const clock = this.reduceMotion ? 0 : t + (g === 'female' ? 1.7 : 0)
    const k = a.selectAt != null && a.selectAt >= 0 ? (nowMs - a.selectAt) / 1000 / selectSeconds : 1
    const motion = k < 1 && !this.reduceMotion && a.walk < 0.05 ? selectMotion(g, clock, k) : idleMotion(g, clock)
    const looking = lookUpAt(motion.pose, a.look, clock)
    const pose = a.walk > 0.02 ? StudyRoomPose.lerp(looking, walkingPose(a.phase), a.walk) : looking
    const ground = groundAt(a.x)
    const lift = motion.lift * (1 - a.walk)
    return { id: g, character: this.characters[g], x: a.x, y: ground + standingLift + lift + walkBob(a.phase, a.walk), z: a.z, yaw: a.yaw + motion.yaw * (1 - a.walk), pose, scale }
  }

  /** a를 (x, z)로 걸어서 옮긴다. 다 오면 yaw 쪽으로 돈다. */
  private moveToward(a: ActorState, x: number, z: number, yaw: number, dt: number) {
    if (this.reduceMotion) { a.x = x; a.z = z; a.yaw = yaw; a.walk = 0; return }
    const dx = x - a.x
    const dz = z - a.z
    const d = Math.hypot(dx, dz)
    const step = walkSpeed * 0.6 * dt
    if (d > 0.01) {
      const k = Math.min(1, step / d)
      a.x += dx * k
      a.z += dz * k
      a.phase += step * stepsPerMeter * Math.PI
      a.walk = Math.min(1, a.walk + dt * 6)
      // 짧게 옆걸음·앞걸음할 때는 몸을 돌리지 않는다.
      if (d > 0.6) a.yaw += angleDelta(a.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 8)
      else a.yaw += angleDelta(a.yaw, yaw) * Math.min(1, dt * 8)
    } else {
      a.walk = Math.max(0, a.walk - dt * 5)
      a.yaw += angleDelta(a.yaw, yaw) * Math.min(1, dt * 6)
    }
  }

  private enterFrame(nowMs: number, dt: number, size: Size): StudyRoomCinematicFrame | null {
    const e = this.enter!
    const g = this.gender!
    const a = this.actors[g]
    const seatCam = StudyRoomSeatCamera.of('thirdPerson', e.seat, size)
    if (e.doneMs != null) {
      // 앉은 뒤: 3인칭 시점으로 1초에 걸쳐 옮기고 끝낸다.
      const k = this.reduceMotion || e.doneMs === -Infinity ? 1 : Math.min(1, (nowMs - e.doneMs) / 1000)
      if (k >= 1) return null
      const from = this.camera ?? seatCam
      return { camera: StudyRoomSeatCamera.lerp(from, seatCam, smooth(k)), actors: [], hiddenSeat: null, cutHeight: 1.3 + 3.2 * smooth(k) }
    }
    e.startedMs ??= nowMs
    const total = pathLength(e.path)
    const walked = this.reduceMotion ? total : Math.min(total, ((nowMs - e.startedMs) / 1000) * walkSpeed)
    const { point, heading } = pointAlong(e.path, walked)
    a.x = point.x
    a.z = point.z
    a.phase += dt * walkSpeed * stepsPerMeter * Math.PI
    a.walk = walked < total ? Math.min(1, a.walk + dt * 5) : 0
    a.yaw += angleDelta(a.yaw, heading) * Math.min(1, dt * 7)
    // 카메라 방향은 걷는 방향을 천천히 따라간다.
    e.heading += angleDelta(e.heading, heading) * Math.min(1, dt * 2.2)
    const ground = groundAt(a.x)
    const follow = followCamera(a.x, ground + standingLift, a.z, e.heading, size)
    // 처음 1.2초는 얼굴 쪽 카메라에서 등 뒤 카메라로 돈다.
    const turnK = this.reduceMotion ? 1 : Math.min(1, (nowMs - e.startedMs) / 1200)
    const start = this.camera ?? follow
    const cam = turnK < 1 ? StudyRoomSeatCamera.lerp(start, follow, smooth(turnK)) : follow
    // 문에 가까워지면 벽 윗부분을 걷어 낸다(문밖 카메라가 벽 너머 사람을 보게). 안에서는 그대로 둔다.
    const nearDoor = Math.max(0, Math.min(1, (a.x - (floorEdgeX - 2.4)) / 1.2))
    const cutHeight = 4.5 - 3.2 * smooth(nearDoor)
    if (walked >= total && !e.seated) {
      // 자리 쪽으로 돌아 의자 위로 폴짝 올라앉는다.
      e.seated = true
      e.doneMs = nowMs
      this.camera = cam
      e.onSeated()
      return { camera: cam, actors: [], hiddenSeat: null, cutHeight }
    }
    if (turnK >= 1) this.camera = cam
    else if (!this.camera) this.camera = cam
    const pose = StudyRoomPose.lerp(standingPose(nowMs / 1000), walkingPose(a.phase), a.walk)
    return {
      camera: cam,
      actors: [{ id: g, character: this.characters[g], x: a.x, y: ground + standingLift + walkBob(a.phase, a.walk), z: a.z, yaw: a.yaw, pose }],
      hiddenSeat: 0,
      cutHeight,
    }
  }
}

function pathLength(path: Vector3[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) total += path[i]!.distanceTo(path[i - 1]!)
  return total
}

function pointAlong(path: Vector3[], distance: number): { point: Vector3; heading: number } {
  let left = distance
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    const seg = a.distanceTo(b)
    const heading = Math.atan2(b.x - a.x, b.z - a.z)
    if (left <= seg || i === path.length - 1) {
      const k = seg > 0 ? Math.min(1, left / seg) : 1
      return { point: a.clone().lerp(b, k), heading }
    }
    left -= seg
  }
  const last = path[path.length - 1]!
  return { point: last.clone(), heading: 0 }
}
