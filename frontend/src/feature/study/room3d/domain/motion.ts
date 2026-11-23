// 원본: lib/feature/study/room3d/domain/study_room_motion.dart (PocketTime f574f242)

import { at, dartClamp, dartMod } from './dartMath';

/**
 * 3D 공부방 사람이 하는 일. 자리 종류와 공부 중·쉬는 중에 맞는 것만 고른다(StudyRoomRoutine).
 * 큰 일(1–2분 넘게 이어진다)과 잠깐 하는 짧은 일(기지개·한 모금·둘러보기, 몇 초)이 있다.
 */
export const studyRoomActivityValues = [
  // 책상 · 공부. 책상마다 노트북·펼친 책이 고정으로 놓여 있어 공부 물건은 손에 든다.
  /** 공책을 받쳐 들고 연필로 쓰다가 잠깐 멈춰 읽어 본다. */
  'writing',
  /** 두 손으로 책을 들고 왼쪽 쪽 → 오른쪽 쪽을 읽고 장을 넘긴다. */
  'reading',
  /** 공책을 보다가 고개를 들어 외우고 다시 내려다 맞는지 본다. */
  'memorizing',
  /** 오른손으로 턱을 괴고 왼손으로 책상을 톡톡 두드린다. */
  'thinking',
  // 책상 · 쉬는 중
  /** 휴대폰을 들여다본다. */
  'phone',
  /** 팔을 베고 엎드려 존다. */
  'napping',
  /** 등을 펴고 느긋하게 둘레를 본다. */
  'chilling',
  // 소파 · 공부
  /** 등을 기대고 두 손으로 책을 들고 읽는다. */
  'sofaReading',
  /** 무릎에 공책을 얹고 쓴다. */
  'sofaNotes',
  /** 무릎에 노트북을 얹고 두드린다. */
  'sofaLaptop',
  /** 등을 기대고 위를 보며 생각한다. */
  'sofaThinking',
  // 소파 · 쉬는 중
  /** 기대어 휴대폰을 본다. */
  'sofaPhone',
  /** 깊이 기대어 존다. */
  'sofaDozing',
  // 짧은 일
  /** 두 팔을 머리 위로 뻗는 기지개. */
  'stretching',
  /** 책상 머그로 한 모금 마신다. */
  'sipping',
  /** 고개를 돌려 둘레를 한 번 둘러본다. */
  'lookingAround',
] as const;
export type StudyRoomActivity = (typeof studyRoomActivityValues)[number];

/** 몇 초짜리 짧은 일인지. */
export function isAccentActivity(activity: StudyRoomActivity): boolean {
  return activity === 'stretching' || activity === 'sipping' || activity === 'lookingAround';
}

/** 앉은 자리 종류: desk(책상 앞 의자), lounge(책상 없는 소파·안락의자). */
export const studyRoomSeatKindValues = ['desk', 'lounge'] as const;
export type StudyRoomSeatKind = (typeof studyRoomSeatKindValues)[number];

/** 앉은 사람 상태. */
export const studyRoomMoodValues = ['focusing', 'resting'] as const;
export type StudyRoomMood = (typeof studyRoomMoodValues)[number];

/**
 * 몸 관절. 3D 부품(`char_rig`)의 조각과 1:1이다.
 * 다리 관절의 기본 자세는 앉은 자세다(허벅지는 앞, 정강이는 아래).
 */
export const studyRoomJointValues = [
  'torso',
  'neck',
  'upperArmL',
  'upperArmR',
  'lowerArmL',
  'lowerArmR',
  'handL',
  'handR',
  'upperLegL',
  'upperLegR',
  'lowerLegL',
  'lowerLegR',
] as const;
export type StudyRoomJoint = (typeof studyRoomJointValues)[number];

/**
 * 사람이 쓰는 물건. 손에 쥐는 것(오른손), 가슴 앞에 드는 것(몸통), 책상·무릎에 두는 것
 * (사람 원점)이 있다. 3D 부품 이름과 붙이는 자리는 렌더러가 정한다.
 * - pencil: 오른손 연필 / mugHand: 오른손 머그(마실 때) / phone: 오른손 휴대폰
 * - bookHeld: 두 손으로 가슴 앞에 든 책(넘기는 한 장은 StudyRoomPose.leaf로 돈다)
 * - notebookHeld: 한 손으로 받쳐 든 공책(책상)
 * - mugDesk: 책상 위 머그(연필 쥐는 손 쪽 앞 가장자리)
 * - notebookLap·laptopLap: 무릎 위 공책·노트북(소파)
 */
export const studyRoomPropValues = [
  'pencil',
  'mugHand',
  'phone',
  'bookHeld',
  'notebookHeld',
  'mugDesk',
  'notebookLap',
  'laptopLap',
] as const;
export type StudyRoomProp = (typeof studyRoomPropValues)[number];

/**
 * 관절 회전(라디안, glTF 공간 기준). 기본 자세(책상에 팔을 올림)에 곱한다:
 * `R = Ry(yaw)·Rx(pitch)·Rz(roll)`.
 * - pitch: 앞(+Z)을 아래(-Y)로 숙이면 +. 고개를 숙이거나 팔을 내리는 방향.
 * - yaw: 앞을 +X(사람의 왼쪽 화면 오른쪽)로 돌리면 +.
 * - roll: 위(+Y)를 -X로 기울이면 +.
 */
export class StudyRoomJointAngles {
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;

  constructor({ pitch = 0, yaw = 0, roll = 0 }: { pitch?: number; yaw?: number; roll?: number } = {}) {
    this.pitch = pitch;
    this.yaw = yaw;
    this.roll = roll;
  }

  static readonly zero = new StudyRoomJointAngles();

  get isFinite(): boolean {
    return Number.isFinite(this.pitch) && Number.isFinite(this.yaw) && Number.isFinite(this.roll);
  }

  plus(o: StudyRoomJointAngles): StudyRoomJointAngles {
    return new StudyRoomJointAngles({ pitch: this.pitch + o.pitch, yaw: this.yaw + o.yaw, roll: this.roll + o.roll });
  }

  /** a→b 사이 t(0–1) 지점. 자세 전환(크로스페이드)에 쓴다. */
  static lerp(a: StudyRoomJointAngles, b: StudyRoomJointAngles, t: number): StudyRoomJointAngles {
    return new StudyRoomJointAngles({
      pitch: a.pitch + (b.pitch - a.pitch) * t,
      yaw: a.yaw + (b.yaw - a.yaw) * t,
      roll: a.roll + (b.roll - a.roll) * t,
    });
  }

  equals(other: StudyRoomJointAngles): boolean {
    return other.pitch === this.pitch && other.yaw === this.yaw && other.roll === this.roll;
  }
}

export type StudyRoomJointMap = Readonly<Partial<Record<StudyRoomJoint, StudyRoomJointAngles>>>;

function setEquals<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

const emptyProps: ReadonlySet<StudyRoomProp> = new Set();

/** 한 순간의 자세. */
export class StudyRoomPose {
  /** 빠진 관절은 기본 자세 그대로다. */
  readonly joints: StudyRoomJointMap;
  /** 보이는 물건. */
  readonly props: ReadonlySet<StudyRoomProp>;
  /** 사람 원점(의자 방석 기준)을 들어 올린 높이(m). 의자에 앉은 사람은 0. */
  readonly lift: number;
  /** 눈 뜬 정도(1 뜸, 0 감음). */
  readonly eyeOpen: number;
  /** 입 벌린 정도(0 기본, 1 가장 크게). */
  readonly mouthOpen: number;
  /** 든 책에서 넘기는 한 장이 간 정도(0 오른쪽 쪽 위, 1 왼쪽 쪽 위). */
  readonly leaf: number;

  constructor({
    joints,
    props = emptyProps,
    lift = 0,
    eyeOpen = 1,
    mouthOpen = 0,
    leaf = 0,
  }: {
    joints: StudyRoomJointMap;
    props?: ReadonlySet<StudyRoomProp>;
    lift?: number;
    eyeOpen?: number;
    mouthOpen?: number;
    leaf?: number;
  }) {
    this.joints = joints;
    this.props = props;
    this.lift = lift;
    this.eyeOpen = eyeOpen;
    this.mouthOpen = mouthOpen;
    this.leaf = leaf;
  }

  /** 오른손에 연필을 쥐는지. */
  get holdsPencil(): boolean {
    return this.props.has('pencil');
  }

  /** Dart `pose[joint]`: 없으면 0 회전. */
  joint(joint: StudyRoomJoint): StudyRoomJointAngles {
    return this.joints[joint] ?? StudyRoomJointAngles.zero;
  }

  /** 모든 값이 유한한지(관절·높이·얼굴). */
  get isFinite(): boolean {
    return (
      Number.isFinite(this.lift) &&
      Number.isFinite(this.leaf) &&
      Number.isFinite(this.eyeOpen) &&
      Number.isFinite(this.mouthOpen) &&
      Object.values(this.joints).every((angles) => angles === undefined || angles.isFinite)
    );
  }

  /**
   * a→b 사이 t(0–1) 지점. 관절은 각도를, 높이·얼굴은 값을 선형으로 섞는다.
   * 물건은 절반을 넘으면 b의 것으로 바꾼다.
   */
  static lerp(a: StudyRoomPose, b: StudyRoomPose, t: number): StudyRoomPose {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const joints: Partial<Record<StudyRoomJoint, StudyRoomJointAngles>> = {};
    for (const joint of studyRoomJointValues) {
      if (joint in a.joints || joint in b.joints) {
        joints[joint] = StudyRoomJointAngles.lerp(a.joint(joint), b.joint(joint), t);
      }
    }
    return new StudyRoomPose({
      joints,
      props: t < 0.5 ? a.props : b.props,
      lift: a.lift + (b.lift - a.lift) * t,
      eyeOpen: a.eyeOpen + (b.eyeOpen - a.eyeOpen) * t,
      mouthOpen: a.mouthOpen + (b.mouthOpen - a.mouthOpen) * t,
      leaf: a.leaf + (b.leaf - a.leaf) * t,
    });
  }

  /** 높이·물건·얼굴만 바꾼 자세(관절은 그대로). */
  copyWith({
    props,
    lift,
    eyeOpen,
    mouthOpen,
  }: {
    props?: ReadonlySet<StudyRoomProp>;
    lift?: number;
    eyeOpen?: number;
    mouthOpen?: number;
  }): StudyRoomPose {
    return new StudyRoomPose({
      joints: this.joints,
      props: props ?? this.props,
      lift: lift ?? this.lift,
      eyeOpen: eyeOpen ?? this.eyeOpen,
      mouthOpen: mouthOpen ?? this.mouthOpen,
      leaf: this.leaf,
    });
  }

  equals(other: StudyRoomPose): boolean {
    return (
      setEquals(other.props, this.props) &&
      other.lift === this.lift &&
      other.eyeOpen === this.eyeOpen &&
      other.mouthOpen === this.mouthOpen &&
      other.leaf === this.leaf &&
      studyRoomJointValues.every((joint) => other.joint(joint).equals(this.joint(joint)))
    );
  }

  /**
   * activity를 한 지 local초(전체 length초 중), 방 시계 t초의 자세. 같은 입력이면 늘 같은
   * 자세다. 각도는 `tool/blender/study_room/build_figures.py`의 관절 계층에 맞춘 값이다.
   */
  static of(activity: StudyRoomActivity, t: number, { local = 0, length = 1 }: { local?: number; length?: number } = {}): StudyRoomPose {
    switch (activity) {
      case 'writing':
        return writing(t);
      case 'reading':
        return heldBook(t, { recline: 0.04 });
      case 'memorizing':
        return memorizing(t);
      case 'thinking':
        return thinking(t);
      case 'phone':
        return phone(t, { lounge: false });
      case 'napping':
        return napping(t);
      case 'chilling':
        return chilling(t);
      case 'sofaReading':
        return sofaReading(t);
      case 'sofaNotes':
        return sofaNotes(t);
      case 'sofaLaptop':
        return sofaLaptop(t);
      case 'sofaThinking':
        return sofaThinking(t);
      case 'sofaPhone':
        return phone(t, { lounge: true });
      case 'sofaDozing':
        return sofaDozing(t);
      case 'stretching':
        return stretching(t, local, length);
      case 'sipping':
        return sipping(t, local, length);
      case 'lookingAround':
        return lookingAround(t, local, length);
    }
  }
}

// ---------------------------------------------------------------------------
// 일과: 사람마다 정해진(같은 사람·같은 시각이면 늘 같은) 일의 순서.

interface Segment {
  readonly activity: StudyRoomActivity;
  readonly start: number;
  readonly length: number;
}

type Weighted = readonly (readonly [StudyRoomActivity, number])[];

/**
 * 한 사람의 일과. 사람 seed·자리 종류·상태로 일 순서를 만들고, 방 시계 poseAt초의 자세를
 * 준다. 큰 일은 1–2분 넘게 이어지고, 바뀔 때는 blendSeconds 동안 부드럽게 넘어간다.
 * 기지개 같은 짧은 일은 몇 분에 한 번만 끼운다(minStretchGap).
 *
 * seed는 안전한 정수(|seed| < 2^53)여야 Dart와 같은 수열이 나온다.
 */
export class StudyRoomRoutine {
  readonly seed: number;
  readonly seat: StudyRoomSeatKind;
  readonly mood: StudyRoomMood;

  /** 책상에 머그를 두는 사람인지(한 모금 마시는 짧은 일도 이 사람만). */
  readonly hasMug: boolean;

  /** 일이 바뀔 때 섞는 시간(초). */
  static readonly blendSeconds = 1.8;

  /** 큰 일 하나의 길이(초): 공부 중 / 쉬는 중. */
  static readonly focusSeconds = { min: 70.0, max: 160.0 } as const;
  static readonly restSeconds = { min: 50.0, max: 120.0 } as const;

  /** 기지개 사이 최소 간격(초). */
  static readonly minStretchGap = 360.0;

  private readonly rng: Lcg;
  private readonly phase: number;
  private readonly segments: Segment[] = [];
  private end = 0;
  private lastStretch = -1e9;

  constructor({ seed, seat, mood }: { seed: number; seat: StudyRoomSeatKind; mood: StudyRoomMood }) {
    this.seed = seed;
    this.seat = seat;
    this.mood = mood;
    const seatIndex = studyRoomSeatKindValues.indexOf(seat);
    const moodIndex = studyRoomMoodValues.indexOf(mood);
    // Dart: seed ^ (seat.index * 0x9e3779b1) ^ (mood.index << 7) 를 64비트로 계산한 뒤 Lcg가
    // `& 0x7fffffff`로 아래 31비트만 쓴다. XOR은 비트끼리라 JS의 32비트 XOR(ToInt32)로도 아래
    // 31비트가 같다(seatIndex * 0x9e3779b1은 2^53 아래라 정확하다).
    this.rng = new Lcg(seed ^ (seatIndex * 0x9e3779b1) ^ (moodIndex << 7));
    // `seed & 0x7fffffff`도 아래 31비트라 JS ToInt32와 같다.
    this.phase = ((seed & 0x7fffffff) % 997) * 0.37;
    // Dart `seed >> 5`는 64비트 산술 이동(= floor(seed / 32)). JS `>>`는 32비트로 잘라 2^31 이상의
    // FNV 해시에서 음수가 되므로 Math.floor 나눗셈으로 바꾸고, Dart `%`(늘 0 이상)는 dartMod로 낸다.
    this.hasMug = seat === 'desk' && dartMod(Math.floor(seed / 32), 3) !== 0;
  }

  /** 이 사람이 할 수 있는 큰 일과 비중. */
  private get mains(): Weighted {
    if (this.seat === 'desk') {
      return this.mood === 'focusing'
        ? [
            ['writing', 4],
            ['reading', 4],
            ['memorizing', 3],
            ['thinking', 2],
          ]
        : [
            ['phone', 3],
            ['chilling', 3],
            ['napping', 1],
          ];
    }
    return this.mood === 'focusing'
      ? [
          ['sofaReading', 4],
          ['sofaNotes', 3],
          ['sofaLaptop', 2],
          ['sofaThinking', 1],
        ]
      : [
          ['sofaPhone', 3],
          ['sofaDozing', 2],
          ['sofaThinking', 1],
        ];
  }

  /** 방 시계 seconds초에 하는 일. */
  activityAt(seconds: number): StudyRoomActivity {
    return this.segmentAt(seconds + this.phase).activity;
  }

  /** 방 시계 seconds초의 자세(일 사이는 섞는다). 책상 머그는 마시는 동안만 손으로 옮긴다. */
  poseAt(seconds: number): StudyRoomPose {
    const u = seconds + this.phase;
    const index = this.indexAt(u);
    const segment = at(this.segments, index);
    let pose = this.poseOf(segment, u);
    const into = u - segment.start;
    if (index > 0 && into < StudyRoomRoutine.blendSeconds) {
      const before = this.poseOf(at(this.segments, index - 1), u);
      const k = smooth(into / StudyRoomRoutine.blendSeconds);
      pose = StudyRoomPose.lerp(before, pose, k);
    }
    return pose;
  }

  private poseOf(segment: Segment, u: number): StudyRoomPose {
    const pose = StudyRoomPose.of(segment.activity, u, { local: u - segment.start, length: segment.length });
    if (!this.hasMug || pose.props.has('mugHand')) return pose;
    return pose.copyWith({ props: new Set([...pose.props, 'mugDesk']) });
  }

  private segmentAt(u: number): Segment {
    return at(this.segments, this.indexAt(u));
  }

  private indexAt(u: number): number {
    if (u < 0) u = 0;
    while (this.end <= u) {
      this.grow();
    }
    // 이분 탐색: start <= u 인 마지막 구간.
    let lo = 0;
    let hi = this.segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (at(this.segments, mid).start <= u) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  private grow(): void {
    const mains = this.mains;
    let last: Segment = { activity: 'stretching', start: 0, length: 0 };
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = at(this.segments, i);
      if (!isAccentActivity(s.activity)) {
        last = s;
        break;
      }
    }
    // 큰 일: 바로 앞과 다른 것을 비중대로.
    const choices = mains.filter(([activity]) => activity !== last.activity || mains.length === 1);
    const total = choices.reduce((sum, c) => sum + c[1], 0);
    let pick = this.rng.nextInt(total);
    let activity = at(choices, 0)[0];
    for (const [a, w] of choices) {
      if (pick < w) {
        activity = a;
        break;
      }
      pick -= w;
    }
    const range = this.mood === 'focusing' ? StudyRoomRoutine.focusSeconds : StudyRoomRoutine.restSeconds;
    const length = range.min + this.rng.nextDouble() * (range.max - range.min);
    this.add(activity, length);
    // 짧은 일: 가끔만(기지개는 minStretchGap마다 많아야 한 번).
    if (this.rng.nextDouble() < 0.4) {
      const accents: (readonly [StudyRoomActivity, number, number])[] = [['lookingAround', 3, 7.0]];
      if (this.hasMug) accents.push(['sipping', 4, 9.0]);
      if (this.end - this.lastStretch >= StudyRoomRoutine.minStretchGap) accents.push(['stretching', 2, 7.5]);
      const sum = accents.reduce((s, a) => s + a[1], 0);
      let p = this.rng.nextInt(sum);
      for (const [a, w, len] of accents) {
        if (p < w) {
          if (a === 'stretching') this.lastStretch = this.end;
          this.add(a, len);
          break;
        }
        p -= w;
      }
    }
  }

  private add(activity: StudyRoomActivity, length: number): void {
    this.segments.push({ activity, start: this.end, length });
    this.end += length;
  }
}

/**
 * 실행·기기와 상관없이 같은 수열(String.hashCode·Random 구현에 기대지 않는다).
 *
 * Dart는 `_state * 1103515245 + 12345`를 64비트로 넘치지 않게 계산한 뒤 `& 0x7fffffff`로 아래
 * 31비트를 남긴다(_state < 2^31이라 곱이 2^63 아래). JS 실수 곱은 2^53을 넘어 아래 비트가
 * 사라지므로 Math.imul로 곱의 아래 32비트를 얻고, 12345를 더한 뒤 `& 0x7fffffff`로 같은 31비트를
 * 낸다(덧셈 결과는 2^53 아래라 정확하고, `&`의 ToInt32가 mod 2^32를 취한다).
 */
class Lcg {
  private state: number;

  constructor(seed: number) {
    this.state = (seed & 0x7fffffff) | 1;
  }

  private next(): number {
    this.state = (Math.imul(this.state, 1103515245) + 12345) & 0x7fffffff;
    return this.state;
  }

  /** state는 0 이상 31비트라 `>> 4`·`%`가 Dart와 같다. */
  nextInt(max: number): number {
    return (this.next() >> 4) % max;
  }

  nextDouble(): number {
    return (this.next() >> 4) / (0x7fffffff >> 4);
  }
}

/**
 * 실행마다 같은 값을 주는 문자열 해시(FNV-1a 32비트, 0 이상 2^32 미만).
 *
 * Dart는 `(hash * 0x01000193) & 0xffffffff`를 64비트로 계산한다(hash < 2^32라 곱이 2^56 아래로
 * 넘치지 않는다). JS는 Math.imul로 곱의 아래 32비트를 얻고 `>>> 0`으로 부호 없는 값으로 바꿔 같은
 * 값을 낸다. 문자 단위는 Dart `codeUnits`와 같은 UTF-16 코드 단위(charCodeAt)다.
 */
export function studyRoomHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash = (hash ^ value.charCodeAt(i)) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// 자세

function wave(t: number, period: number, phase = 0): number {
  return Math.sin((2 * Math.PI * t) / period + phase);
}

function smooth(x: number): number {
  const c = dartClamp(x, 0.0, 1.0);
  return c * c * (3 - 2 * c);
}

/** cycle초마다 start–end 구간에서 0→1→0으로 부드럽게 오르내린다. */
function bump(t: number, cycle: number, start: number, end: number): number {
  const u = dartMod(t, cycle);
  if (u < start || u > end) return 0;
  return Math.sin((Math.PI * (u - start)) / (end - start));
}

/** cycle초마다 올라가 머물렀다 내려온다(rise·hold·fall 초). */
function envelope(t: number, cycle: number, rise: number, hold: number, fall: number, delay = 0): number {
  const u = dartMod(t, cycle) - delay;
  if (u < 0) return 0;
  if (u < rise) return smooth(u / rise);
  if (u < rise + hold) return 1;
  if (u < rise + hold + fall) return 1 - smooth((u - rise - hold) / fall);
  return 0;
}

function J(a: { pitch?: number; yaw?: number; roll?: number } = {}): StudyRoomJointAngles {
  return new StudyRoomJointAngles(a);
}

/** 숨쉬기: 몸통이 아주 조금 오르내린다. */
function breath(t: number, period = 4.6): number {
  return 0.012 * wave(t, period);
}

/** 소파에 기댄 자세(몸통을 뒤로 젖힌다). 팔·책은 몸통을 따라간다. */
const recline = -0.34;

/** 눈 깜빡임(4–6초에 한 번 0.18초). */
function blink(t: number, period = 4.7): number {
  return Math.max(0, 1 - bump(t, period, 0, 0.18) - bump(t, period * 2.3, 1.1, 1.28));
}

// 든 공책·책을 잡는 팔(몸통 기준). 두 손이 책 양옆 아래를 받친다.
const holdUpperL = J({ pitch: 0.25, yaw: 0.2 });
const holdUpperR = J({ pitch: 0.25, yaw: -0.2 });
const holdLowerL = J({ pitch: -0.6, yaw: 0.3 });
const holdLowerR = J({ pitch: -0.6, yaw: -0.3 });

/** 한 장 읽는 데 걸리는 시간(초)과 넘기는 시간. */
const pageSeconds = 21.0;
const turnSeconds = 1.6;

const props = (...items: StudyRoomProp[]): ReadonlySet<StudyRoomProp> => new Set(items);

/**
 * 두 손으로 든 책을 읽는다(책상·소파 공통, 책은 몸통에 붙어 함께 기운다).
 * 한 장마다 왼쪽 쪽 → 오른쪽 쪽을 줄 따라 읽고 오른손(화면 왼쪽 손)으로 넘긴다. 53초마다
 * 고개를 들어 잠깐 생각한다.
 */
function heldBook(t: number, { recline: lean, legs = {} }: { recline: number; legs?: StudyRoomJointMap }): StudyRoomPose {
  const u = dartMod(t, pageSeconds);
  const readEnd = pageSeconds - turnSeconds;
  // 넘기기: 손이 먼저 올라가 집고(0.3초), 장이 1초 동안 넘어가며 손이 따라간다.
  const reach = envelope(t, pageSeconds, 0.35, 0.95, 0.3, readEnd);
  const leaf = u < readEnd + 0.3 ? 0.0 : smooth((u - readEnd - 0.3) / 1.0);
  // 읽는 곳: 앞 절반은 왼쪽 쪽(+X, 고개 +), 뒤 절반은 오른쪽 쪽. 쪽 안에서는 위→아래.
  const r = dartClamp(u / readEnd, 0.0, 1.0);
  const half = smooth((r - 0.46) / 0.08);
  const down = r < 0.5 ? r * 2 : (r - 0.5) * 2;
  // 한 줄(1.7초) 동안 눈이 왼→오로 가고 다음 줄 처음으로 돌아온다.
  const line = dartMod(t, 1.7) / 1.7;
  const scan = line < 0.85 ? line / 0.85 : 1 - (line - 0.85) / 0.15;
  // 생각: 53초마다 4초 고개를 들어 앞을 본다(읽는 중일 때만).
  const pause = envelope(t, 53.0, 0.9, 2.4, 0.9, 31.0) * (1 - reach);
  const pageYaw = 0.1 * (1 - half) - 0.1 * half;
  return new StudyRoomPose({
    props: props('bookHeld'),
    leaf,
    eyeOpen: blink(t),
    joints: {
      torso: J({ pitch: lean + breath(t) - 0.04 * pause, roll: 0.015 * wave(t, 9.0) }),
      neck: J({
        pitch: 0.24 + 0.1 * down - 0.34 * pause + 0.06 * reach,
        yaw: (pageYaw + 0.035 * (0.5 - scan)) * (1 - pause) - 0.06 * reach,
        roll: 0.03 * wave(t, 13.0) + 0.05 * pause,
      }),
      upperArmL: J({ pitch: 0.25 - 0.08 * reach, yaw: 0.2 + 0.08 * reach }),
      upperArmR: holdUpperR,
      // 넘기는 손(화면 왼쪽 = 사람 오른손): 안쪽 위로 들어 모서리를 집고 따라 넘긴다.
      lowerArmL: J({ pitch: -0.6 - 0.22 * reach, yaw: 0.3 + 0.32 * reach + 0.25 * leaf * reach }),
      lowerArmR: holdLowerR,
      handL: J({ roll: -0.35 * reach, pitch: -0.2 * reach }),
      // 받치는 손은 책 무게로 아주 조금 흔들린다.
      handR: J({ pitch: 0.03 * wave(t, 3.3) }),
      ...legs,
    },
  });
}

/** 공책을 왼손으로 받쳐 들고 오른손 연필로 쓴다. 6초 쓰고 1.5초 멈춰 읽고, 27초마다 훑는다. */
function writing(t: number): StudyRoomPose {
  const gate = envelope(t, 7.5, 0.3, 5.6, 0.3);
  const review = envelope(t, 27.0, 0.7, 2.2, 0.7, 18.0);
  const g = gate * (1 - review);
  const stroke = wave(t, 0.42);
  // 한 줄 다 쓰면(약 2.3초) 손을 줄 처음으로 옮긴다.
  const along = dartMod(t, 2.3) / 2.3;
  return new StudyRoomPose({
    props: props('notebookHeld', 'pencil'),
    eyeOpen: blink(t, 5.3),
    joints: {
      torso: J({ pitch: 0.06 + breath(t) - 0.05 * review }),
      neck: J({
        pitch: 0.4 - 0.12 * review + 0.02 * wave(t, 2.6),
        yaw: -0.04 + 0.06 * (along - 0.5) * g + 0.04 * review,
      }),
      upperArmL: holdUpperL,
      upperArmR: J({ pitch: 0.25, yaw: -0.15 }),
      lowerArmL: holdLowerL,
      lowerArmR: J({
        pitch: -0.6 + 0.02 * Math.abs(stroke) * g - 0.08 * review,
        yaw: -0.5 - 0.1 * (along - 0.5) * g + 0.03 * stroke * g,
      }),
      handR: J({ pitch: 0.16 * wave(t, 0.21) * g }),
      handL: J({ pitch: 0.03 * wave(t, 4.1) }),
    },
  });
}

/** 외우기: 공책을 4.5초 내려다보고, 고개를 들어 6초 외우고, 다시 1.5초 맞는지 본다. */
function memorizing(t: number): StudyRoomPose {
  const cycle = 13.0;
  const up = envelope(t, cycle, 1.1, 4.6, 1.0, 4.4);
  const side = dartMod(Math.floor(t / cycle), 2) === 0 ? 1.0 : -1.0;
  const talk = Math.max(0.0, wave(t, 0.36)) * bump(t, 0.36 * 7, 0, 0.36 * 5.5);
  // 맞았는지 볼 때 작게 끄덕인다.
  const nod = bump(t, cycle, 11.6, 12.4);
  return new StudyRoomPose({
    props: props('notebookHeld'),
    eyeOpen: (1 - 0.45 * up * (side > 0 ? 1 : 0)) * blink(t, 4.1),
    // 고개를 거의 다 든 뒤에만 입을 움직인다.
    mouthOpen: 0.45 * talk * smooth((up - 0.7) / 0.3),
    joints: {
      torso: J({ pitch: 0.05 + breath(t) - 0.06 * up }),
      neck: J({
        pitch: 0.4 - 0.45 * up + 0.06 * nod + 0.03 * wave(t, 1.3) * up,
        yaw: 0.22 * side * up,
        roll: 0.05 * side * up,
      }),
      upperArmL: holdUpperL,
      upperArmR: holdUpperR,
      lowerArmL: J({ pitch: -0.6 + 0.12 * up, yaw: 0.3 }),
      lowerArmR: J({ pitch: -0.6 + 0.12 * up, yaw: -0.3 }),
      // 외울 때 손가락으로 공책을 톡톡(박자 맞추기).
      handR: J({ pitch: 0.15 * Math.max(0, wave(t, 0.72)) * up }),
    },
  });
}

function thinking(t: number): StudyRoomPose {
  return new StudyRoomPose({
    eyeOpen: blink(t, 5.9),
    joints: {
      torso: J({ pitch: 0.06 + breath(t), roll: -0.06 }),
      neck: J({
        pitch: 0.05 + 0.04 * wave(t, 6.7),
        yaw: -0.1 + 0.08 * wave(t, 11.1),
        roll: -0.22 + 0.04 * wave(t, 5.9),
      }),
      // 오른 팔꿈치는 책상에, 손은 턱에.
      upperArmR: J({ pitch: 0.1, yaw: -0.05 }),
      lowerArmR: J({ pitch: -2.2 + 0.04 * wave(t, 4.9) }),
      // 왼손은 책상 위에서 가끔 톡톡.
      handL: J({ pitch: 0.18 * Math.max(0, wave(t, 0.5)) * bump(t, 9.0, 3.0, 5.0) }),
    },
  });
}

function phone(t: number, { lounge }: { lounge: boolean }): StudyRoomPose {
  // 오른손으로 가슴 앞에 휴대폰을 들고 엄지로 넘긴다. 왼팔은 내려 둔다.
  const scroll = bump(t, 3.7, 0, 0.5);
  return new StudyRoomPose({
    props: props('phone'),
    joints: {
      torso: J({ pitch: (lounge ? recline : 0.0) + breath(t) }),
      neck: J({ pitch: (lounge ? 0.45 : 0.32) + 0.02 * wave(t, 6.3), yaw: 0.06 + 0.03 * wave(t, 8.9) }),
      upperArmR: J({ pitch: 0.35, yaw: -0.15 }),
      lowerArmR: J({ pitch: -1.15 + 0.03 * wave(t, 5.1) }),
      handR: J({ pitch: -0.3, roll: 0.06 * scroll }),
      upperArmL: J({ pitch: lounge ? 0.7 : 0.1, yaw: 0.1 }),
      lowerArmL: J({ pitch: lounge ? 0.2 : 0.0 }),
    },
  });
}

function napping(t: number): StudyRoomPose {
  // 두 팔을 포개 베고 엎드린다. 느린 숨.
  const b = 0.02 * wave(t, 5.2);
  return new StudyRoomPose({
    eyeOpen: 0,
    joints: {
      torso: J({ pitch: 0.42 + b }),
      neck: J({ pitch: 0.42, yaw: 0.25, roll: 0.1 }),
      upperArmL: J({ pitch: 0.15, yaw: 0.45 }),
      upperArmR: J({ pitch: 0.15, yaw: -0.45 }),
      lowerArmL: J({ yaw: 0.55 }),
      lowerArmR: J({ yaw: -0.55 }),
    },
  });
}

function chilling(t: number): StudyRoomPose {
  // 등을 펴고 천천히 둘레를 본다. 손가락으로 책상을 가끔 두드린다.
  const drum = bump(t, 13.0, 8.0, 10.0);
  return new StudyRoomPose({
    joints: {
      torso: J({ pitch: -0.06 + breath(t) }),
      neck: J({ pitch: 0.02 + 0.03 * wave(t, 9.0), yaw: 0.38 * wave(t, 21.0), roll: 0.04 * wave(t, 13.0) }),
      handR: J({ pitch: 0.2 * Math.max(0, wave(t, 0.32)) * drum }),
    },
  });
}

/** 소파: 기대어 두 손으로 든 책을 읽는다(등을 기대고 다리를 뻗는다). */
function sofaReading(t: number): StudyRoomPose {
  return heldBook(t, {
    recline,
    legs: {
      lowerLegL: J({ pitch: -0.25 }),
      lowerLegR: J({ pitch: -0.18 }),
    },
  });
}

/** 소파: 무릎 위 공책에 쓴다(조금 숙인다). */
function sofaNotes(t: number): StudyRoomPose {
  const gate = envelope(t, 9.0, 0.3, 6.0, 0.4);
  const stroke = wave(t, 0.45);
  return new StudyRoomPose({
    props: props('notebookLap', 'pencil'),
    joints: {
      torso: J({ pitch: 0.12 + breath(t) }),
      neck: J({ pitch: 0.45 + 0.02 * wave(t, 3.1), yaw: -0.06 }),
      upperArmL: J({ pitch: 0.75, yaw: 0.12 }),
      upperArmR: J({ pitch: 0.7, yaw: -0.08 }),
      lowerArmL: J({ pitch: 0.2, yaw: 0.2 }),
      lowerArmR: J({ pitch: 0.3 + 0.03 * Math.abs(stroke) * gate, yaw: -0.05 + 0.07 * stroke * gate }),
      handR: J({ pitch: 0.15 * wave(t, 0.22) * gate }),
      upperLegL: J({ pitch: -0.08 }),
      upperLegR: J({ pitch: -0.08 }),
    },
  });
}

/** 소파: 무릎 위 노트북. */
function sofaLaptop(t: number): StudyRoomPose {
  const typing = envelope(t, 11.0, 0.3, 7.6, 0.4);
  const tap = (period: number, phase: number) => Math.max(0, wave(t, period, phase)) * typing;
  return new StudyRoomPose({
    props: props('laptopLap'),
    joints: {
      torso: J({ pitch: -0.08 + breath(t) }),
      neck: J({ pitch: 0.4 + 0.02 * wave(t, 5.9), yaw: 0.03 * wave(t, 9.0) }),
      upperArmL: J({ pitch: 0.65, yaw: 0.1 }),
      upperArmR: J({ pitch: 0.65, yaw: -0.1 }),
      lowerArmL: J({ pitch: 0.25 - 0.05 * tap(0.2, 0), yaw: 0.12 }),
      lowerArmR: J({ pitch: 0.25 - 0.05 * tap(0.24, 1.3), yaw: -0.12 }),
      handL: J({ pitch: 0.2 * tap(0.2, 0.5) }),
      handR: J({ pitch: 0.2 * tap(0.24, 1.9) }),
      upperLegL: J({ pitch: -0.08 }),
      upperLegR: J({ pitch: -0.08 }),
    },
  });
}

/** 소파: 기대어 위를 보며 생각한다. 손은 배 위에 포갠다. */
function sofaThinking(t: number): StudyRoomPose {
  return new StudyRoomPose({
    joints: {
      torso: J({ pitch: recline - 0.06 + breath(t) }),
      neck: J({ pitch: -0.12 + 0.05 * wave(t, 8.3), yaw: 0.25 * wave(t, 17.0), roll: 0.06 * wave(t, 11.0) }),
      upperArmL: J({ pitch: 0.75, yaw: 0.25 }),
      upperArmR: J({ pitch: 0.75, yaw: -0.25 }),
      lowerArmL: J({ yaw: 0.6 }),
      lowerArmR: J({ yaw: -0.6 }),
      lowerLegL: J({ pitch: -0.3 }),
      lowerLegR: J({ pitch: -0.3 }),
    },
  });
}

/** 소파: 깊이 기대어 존다(고개가 옆으로 떨어진다). */
function sofaDozing(t: number): StudyRoomPose {
  const b = 0.02 * wave(t, 5.6);
  return new StudyRoomPose({
    eyeOpen: 0,
    joints: {
      torso: J({ pitch: recline - 0.1 + b }),
      neck: J({ pitch: 0.28, roll: 0.28, yaw: 0.1 }),
      upperArmL: J({ pitch: 0.85, yaw: 0.2 }),
      upperArmR: J({ pitch: 0.85, yaw: -0.2 }),
      lowerArmL: J({ pitch: 0.2, yaw: 0.4 }),
      lowerArmR: J({ pitch: 0.2, yaw: -0.4 }),
      lowerLegL: J({ pitch: -0.35 }),
      lowerLegR: J({ pitch: -0.3 }),
    },
  });
}

/** 기지개: 천천히 두 팔을 올려 버티고 내린다. local은 이 일을 시작한 지 몇 초. */
function stretching(t: number, local: number, length: number): StudyRoomPose {
  const up = envelope(local, length + 1, 1.4, 2.6, 1.6, 0.6);
  const sway = 0.08 * wave(t, 1.8) * up;
  return new StudyRoomPose({
    eyeOpen: 1 - 0.8 * up,
    mouthOpen: 0.6 * up,
    joints: {
      torso: J({ pitch: 0.02 - 0.16 * up, roll: sway }),
      neck: J({ pitch: 0.05 - 0.32 * up }),
      upperArmL: J({ pitch: -1.35 * up, roll: 0.15 * up }),
      upperArmR: J({ pitch: -1.35 * up, roll: -0.15 * up }),
      lowerArmL: J({ pitch: -0.2 * up }),
      lowerArmR: J({ pitch: -0.2 * up }),
    },
  });
}

/** 한 모금: 머그를 들어 입가로 가져갔다가 내려놓는다. */
function sipping(t: number, local: number, length: number): StudyRoomPose {
  const lift = envelope(local, length + 1, 1.6, 2.6, 1.6, 0.8);
  const sip = bump(local, length + 1, 2.6, 4.4) * lift;
  return new StudyRoomPose({
    props: local > 0.6 && local < length - 1.2 ? props('mugHand') : props(),
    joints: {
      torso: J({ pitch: 0.04 - 0.05 * lift + breath(t) }),
      neck: J({ pitch: 0.18 - 0.3 * lift - 0.08 * sip }),
      upperArmR: J({ pitch: -0.3 * lift, yaw: -0.18 * lift }),
      lowerArmR: J({ pitch: -1.55 * lift, yaw: -0.2 * lift }),
      handR: J({ pitch: 0.35 * lift - 0.2 * sip }),
    },
  });
}

/** 둘러보기: 고개를 한쪽으로 돌렸다가 반대쪽, 다시 앞으로. */
function lookingAround(t: number, local: number, length: number): StudyRoomPose {
  const u = dartClamp(local / length, 0.0, 1.0);
  const yaw = 0.55 * Math.sin(2 * Math.PI * u) * smooth(u * 4) * smooth((1 - u) * 4);
  return new StudyRoomPose({
    joints: {
      torso: J({ pitch: 0.02 + breath(t), yaw: 0.25 * yaw }),
      neck: J({ pitch: 0.04, yaw }),
    },
  });
}
