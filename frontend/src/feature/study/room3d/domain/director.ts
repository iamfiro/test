// 원본: lib/feature/study/room3d/domain/study_room_director.dart (PocketTime f574f242)

import { MathUtils, Vector3 } from 'three';

import { StudyRoomCamera, type StudyRoomSeat, type StudyRoomSize } from '../model/scene';
import { StudyRoomCameraRig } from './cameraRig';
import { at, dartClamp, dartCompare, dartMod, dartTruncDiv } from './dartMath';
import { StudyRoomSeatCamera, type StudyRoomCameraMode } from './seatCamera';

/** 바닥 위 사각형 하나(glTF x·z, m). */
export class StudyRoomFloorArea {
  constructor(
    readonly minX: number,
    readonly minZ: number,
    readonly maxX: number,
    readonly maxZ: number,
  ) {}
}

function biggerArea(a: StudyRoomFloorArea, b: StudyRoomFloorArea): StudyRoomFloorArea {
  return (a.maxX - a.minX) * (a.maxZ - a.minZ) >= (b.maxX - b.minX) * (b.maxZ - b.minZ) ? a : b;
}

/**
 * 카메라가 들어갈 수 있는 방 안(glTF 공간, m): 바닥 사각형들(L자면 둘)과 천장 높이.
 * 카메라를 이 안·천장 아래에만 두어 벽 밖·천장 위(그리지 않은 바깥)가 보이지 않게 한다.
 */
export class StudyRoomInterior {
  readonly areas: readonly StudyRoomFloorArea[];
  /** 천장 높이(m). 카메라는 이보다 ceilingGap 아래에 둔다. */
  readonly ceiling: number;

  private static readonly wallGap = 0.45;
  private static readonly ceilingGap = 0.32;

  constructor({ areas, ceiling }: { areas: readonly StudyRoomFloorArea[]; ceiling: number }) {
    this.areas = areas;
    this.ceiling = ceiling;
  }

  /** 가장 넓은 바닥(홀) 가운데. 넓이가 같으면 앞의 것. */
  get center(): Vector3 {
    const hall = this.hall;
    return new Vector3((hall.minX + hall.maxX) / 2, 0, (hall.minZ + hall.maxZ) / 2);
  }

  /** 가장 넓은 바닥(Dart `reduce`: 비어 있으면 던진다). */
  get hall(): StudyRoomFloorArea {
    if (this.areas.length === 0) throw new Error('Bad state: No element');
    return this.areas.reduce(biggerArea);
  }

  get maxEyeY(): number {
    return this.ceiling - StudyRoomInterior.ceilingGap;
  }

  /** p를 벽에서 조금 떨어진 방 안·천장 아래로 끌어당긴다(가장 가까운 바닥 사각형 안). 새 벡터를 준다. */
  clamp(p: Vector3): Vector3 {
    let best: Vector3 | null = null;
    let bestDistance = Infinity;
    const gap = StudyRoomInterior.wallGap;
    for (const a of this.areas) {
      const q = new Vector3(
        dartClamp(p.x, a.minX + gap, a.maxX - gap),
        dartClamp(p.y, 0.3, this.maxEyeY),
        dartClamp(p.z, a.minZ + gap, a.maxZ - gap),
      );
      const d = q.clone().sub(p).lengthSq();
      if (d < bestDistance) {
        bestDistance = d;
        best = q;
      }
    }
    // 원본은 사각형이 없으면 p 자체를 준다. 호출부가 고쳐 쓰는 일이 있어 복사본을 준다.
    return best ?? p.clone();
  }

  contains(p: Vector3): boolean {
    return this.clamp(p).sub(p).lengthSq() < 1e-6;
  }
}

/**
 * 공부 화면 카메라 연출. 1인칭·3인칭은 내 자리 둘레(StudyRoomSeatCamera)이고, 나머지는 방
 * 전체를 보며 다른 사람들이 함께 공부하는 모습을 비춘다.
 *
 * 공부하면서 보는 화면이라 시선을 뺏지 않게 느리게 움직인다. 모든 카메라는 방 안·천장 아래에
 * 붙잡아 두고, 장면 사이는 눈 위치와 보는 곳을 직접 섞어 옮긴다(각도를 섞으면 옮기는 사이 눈이
 * 벽 밖으로 휜다).
 */
export class StudyRoomDirector {
  private constructor() {}

  /** 자동 연출에서 한 장면을 비추는 시간(초)과, 다음 장면으로 넘어가는 시간(초). */
  static readonly shotSeconds = 24.0;
  static readonly blendSeconds = 6.0;

  /** 장면을 옮길 때 가장 오래 걸리는 시간(초)과 카메라가 넘지 않는 속도(m/s). */
  static readonly maxBlendSeconds = 16.0;
  static readonly maxSpeed = 1.2;

  /** 둘러보기 한 바퀴(초). */
  static readonly roamLapSeconds = 180.0;

  /** 시각에 따라 카메라가 움직이는 시점. */
  static moves(mode: StudyRoomCameraMode): boolean {
    return mode === 'roam' || mode === 'auto';
  }

  /** mode 카메라. seats는 앉은 사람의 자리(0번이 나), seconds는 연출 시각. */
  static shot(
    mode: StudyRoomCameraMode,
    {
      seats,
      size,
      interior,
      seconds = 0,
      orbitDegrees = 0,
    }: {
      seats: readonly StudyRoomSeat[];
      size: StudyRoomSize;
      interior: StudyRoomInterior | null;
      seconds?: number;
      orbitDegrees?: number;
    },
  ): StudyRoomCamera {
    if (seats.length === 0) throw new Error('Bad state: No element');
    const me = at(seats, 0);
    const room = interior;
    if (room === null) {
      return StudyRoomSeatCamera.of(local(mode), me, size, { orbitDegrees });
    }
    let camera: StudyRoomCamera;
    switch (mode) {
      case 'firstPerson':
      case 'thirdPerson':
        camera = StudyRoomSeatCamera.of(mode, me, size, { orbitDegrees });
        break;
      case 'top':
        camera = high(me, size, room);
        break;
      case 'overview':
        camera = overview(seats, size, room, 0);
        break;
      case 'roam':
        camera = roam(seats, size, room, seconds);
        break;
      case 'auto':
        camera = auto(seats, size, room, seconds);
        break;
    }
    // 1인칭은 내 머리 안이라 그대로 둔다.
    return mode === 'firstPerson' ? camera : StudyRoomDirector.keepInside(camera, size, room);
  }

  /** 눈이 방 밖·천장 위면 안으로 끌어당기고, 보는 곳은 그대로 둔다. */
  static keepInside(camera: StudyRoomCamera, size: StudyRoomSize, room: StudyRoomInterior | null): StudyRoomCamera {
    if (room === null) return camera;
    const rig = new StudyRoomCameraRig(camera, size);
    const eye = rig.eye;
    if (room.contains(eye)) return camera;
    return StudyRoomDirector.lookAt(room.clamp(eye), camera.target, size, { fovY: camera.fovYDegrees });
  }

  /** 두 카메라 사이: 눈 위치·보는 곳·화각을 섞고 방 안에 붙잡는다. */
  static blend(
    a: StudyRoomCamera,
    b: StudyRoomCamera,
    t: number,
    size: StudyRoomSize,
    room: StudyRoomInterior | null,
  ): StudyRoomCamera {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const ea = new StudyRoomCameraRig(a, size).eye;
    const eb = new StudyRoomCameraRig(b, size).eye;
    const delta = eb.clone().sub(ea);
    let eye = ea.clone().add(delta.clone().multiplyScalar(t));
    // 둘이 많이 떨어져 있으면 가운데에서 살짝 위로 올려 사람·가구를 뚫고 지나가지 않게 한다.
    const lift = Math.sin(t * Math.PI) * Math.min(0.6, delta.length() * 0.08);
    eye = eye.add(new Vector3(0, lift, 0));
    if (room !== null) eye = room.clamp(eye);
    const target = a.target.clone().add(b.target.clone().sub(a.target).multiplyScalar(t));
    const fov = a.fovYDegrees + (b.fovYDegrees - a.fovYDegrees) * t;
    return StudyRoomDirector.lookAt(eye, target, size, { fovY: fov });
  }

  /** eye에서 target을 보는 원근 카메라(세로 화각 fovY). */
  static lookAt(eye: Vector3, target: Vector3, size: StudyRoomSize, { fovY = 60 }: { fovY?: number } = {}): StudyRoomCamera {
    const d = target.clone().sub(eye);
    const distance = Math.max(d.length(), 0.01);
    const horizontal = Math.sqrt(d.x * d.x + d.z * d.z);
    const pitch = Math.atan2(-d.y, horizontal);
    // 카메라 yaw 0은 -Z를 본다(앉은 사람 기준 yaw + 180°와 같은 규칙).
    const yaw = Math.atan2(d.x, d.z);
    const aspect = size.width / size.height;
    return new StudyRoomCamera({
      projection: 'perspective',
      pitchDegrees: MathUtils.radToDeg(pitch),
      yawDegrees: MathUtils.radToDeg(yaw) + 180,
      fovYDegrees: fovY,
      target,
      viewWidth: distance * 2 * Math.tan(MathUtils.degToRad(fovY) / 2) * aspect,
      minViewHeight: 0,
    });
  }
}

function local(mode: StudyRoomCameraMode): StudyRoomCameraMode {
  switch (mode) {
    case 'firstPerson':
      return 'firstPerson';
    case 'thirdPerson':
      return 'thirdPerson';
    default:
      return 'top';
  }
}

/** 위에서 보기: 천장 바로 아래에서 넓은 화각으로 내 책상 둘레 사람들까지 내려다본다. */
function high(me: StudyRoomSeat, size: StudyRoomSize, room: StudyRoomInterior): StudyRoomCamera {
  const eye = room.clamp(
    me.anchor.sub(me.facing.multiplyScalar(1.4)).add(new Vector3(0, room.maxEyeY, 0)),
  );
  eye.y = room.maxEyeY;
  const target = me.anchor.add(me.facing.multiplyScalar(0.9)).add(new Vector3(0, 0.2, 0));
  return StudyRoomDirector.lookAt(eye, target, size, { fovY: 66 });
}

/** 전체 보기: 홀 모서리 천장 가까이에서 사람들이 모인 곳을 비스듬히 내려다본다. */
function overview(seats: readonly StudyRoomSeat[], size: StudyRoomSize, room: StudyRoomInterior, drift: number): StudyRoomCamera {
  const focus = centroid(seats);
  const hall = room.hall;
  // 사람들에게서 가장 먼 쪽 모서리에서 본다(방 전체가 깊게 들어온다).
  // Dart List.sort(작은 목록은 안정 삽입 정렬)와 JS 안정 정렬은 같은 순서를 준다.
  const corners = [
    new Vector3(hall.minX, 0, hall.minZ),
    new Vector3(hall.minX, 0, hall.maxZ),
    new Vector3(hall.maxX, 0, hall.minZ),
    new Vector3(hall.maxX, 0, hall.maxZ),
  ].sort((a, b) => dartCompare(b.clone().sub(focus).lengthSq(), a.clone().sub(focus).lengthSq()));
  const corner = at(corners, 0);
  const along = focus.clone().sub(corner);
  along.y = 0;
  const eye = room.clamp(
    corner
      .clone()
      .add(along.normalize().multiplyScalar(1.2 + drift))
      .add(new Vector3(0, room.maxEyeY, 0)),
  );
  eye.y = room.maxEyeY;
  return StudyRoomDirector.lookAt(eye, focus.clone().add(new Vector3(0, 0.3, 0)), size, { fovY: 64 });
}

/** 둘러보기: 홀 가운데를 크게 도는 길을 따라 아주 천천히 움직이며 사람들을 본다. */
function roam(seats: readonly StudyRoomSeat[], size: StudyRoomSize, room: StudyRoomInterior, seconds: number): StudyRoomCamera {
  const hall = room.hall;
  const c = room.center;
  const rx = (hall.maxX - hall.minX) / 2 - 1.2;
  const rz = (hall.maxZ - hall.minZ) / 2 - 0.9;
  const a = (seconds * 2 * Math.PI) / StudyRoomDirector.roamLapSeconds;
  const eye = room.clamp(
    new Vector3(c.x + rx * Math.cos(a), 2.6 + 0.2 * Math.sin(a * 2), c.z + rz * Math.sin(a)),
  );
  // 사람들 가운데를 본다.
  const focus = centroid(seats);
  const target = focus.add(new Vector3(0, 0.5, 0));
  return StudyRoomDirector.lookAt(eye, target, size, { fovY: 58 });
}

/**
 * 자동 연출: shotSeconds마다 장면을 바꾼다. 가까운 장면끼리 이어 카메라가 멀리 날지 않게 한다:
 * 내 어깨 너머 → 내 위 → 다른 사람 → 전체 → 둘러보기 → 다른 사람… 넘어갈 때는 blendSeconds
 * 이상(멀면 더 길게) 천천히 옮긴다.
 */
function auto(seats: readonly StudyRoomSeat[], size: StudyRoomSize, room: StudyRoomInterior, seconds: number): StudyRoomCamera {
  const { shotSeconds, blendSeconds, maxBlendSeconds, maxSpeed } = StudyRoomDirector;
  const index = Math.floor(seconds / shotSeconds);
  const into = seconds - index * shotSeconds;
  const now = StudyRoomDirector.keepInside(autoShot(index, seats, size, room, seconds, into), size, room);
  if (index === 0 || into >= maxBlendSeconds) return now;
  const before = StudyRoomDirector.keepInside(
    autoShot(index - 1, seats, size, room, seconds, into + shotSeconds),
    size,
    room,
  );
  // 멀리 옮길수록 오래 걸려 카메라가 maxSpeed보다 빨리 움직이지 않게 한다.
  const distance = new StudyRoomCameraRig(now, size).eye.sub(new StudyRoomCameraRig(before, size).eye).length();
  const duration = dartClamp((1.5 * distance) / maxSpeed, blendSeconds, maxBlendSeconds);
  if (into >= duration) return now;
  const t = into / duration;
  const eased = t * t * (3 - 2 * t);
  return StudyRoomDirector.blend(before, now, eased, size, room);
}

function autoShot(
  index: number,
  seats: readonly StudyRoomSeat[],
  size: StudyRoomSize,
  room: StudyRoomInterior,
  seconds: number,
  into: number,
): StudyRoomCamera {
  const me = at(seats, 0);
  // 장면 안에서는 아주 천천히만 돈다(시선을 뺏지 않게).
  const drift = into / StudyRoomDirector.shotSeconds;
  const others = seats.length - 1;
  const friend = (k: number): StudyRoomCamera => {
    if (others <= 0) return overview(seats, size, room, drift * 0.4);
    // Dart `k % others`는 0 이상이라 dartMod로 맞춘다.
    const seat = at(seats, 1 + dartMod(k, others));
    return StudyRoomSeatCamera.of('thirdPerson', seat, size, { orbitDegrees: -8 + 16 * drift });
  };

  // Dart `index ~/ 6 * 2`는 (index ~/ 6) * 2, `~/`는 0 쪽으로 버린다.
  switch (dartMod(index, 6)) {
    case 0:
      return StudyRoomSeatCamera.of('thirdPerson', me, size, { orbitDegrees: -6 + 12 * drift });
    case 1:
      return high(me, size, room);
    case 2:
      return friend(dartTruncDiv(index, 6) * 2);
    case 3:
      return overview(seats, size, room, drift * 0.4);
    case 4:
      return roam(seats, size, room, seconds);
    default:
      return friend(dartTruncDiv(index, 6) * 2 + 1);
  }
}

/** 자리 앵커의 평균. vector_math `/`는 1/n을 곱하므로 multiplyScalar(1 / n)로 같게 한다. */
function centroid(seats: readonly StudyRoomSeat[]): Vector3 {
  const sum = new Vector3();
  for (const seat of seats) {
    sum.add(seat.anchor);
  }
  return sum.multiplyScalar(1.0 / seats.length);
}
