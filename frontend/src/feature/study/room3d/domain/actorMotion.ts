// 웹 전용(온보딩, 사용자 결정 2026-11-23): 자리 밖에 선 사람·걷는 사람의 자세.
// 캐릭터 GLB에는 애니메이션 클립이 없으므로 앉은 자세(motion.ts)와 같은 방식으로 관절을 돌려 만든다.
// 다리 관절의 기본 자세는 앉은 자세(허벅지는 앞, 정강이는 아래)다. 그래서 서려면 허벅지를 아래로
// +90° 숙이고 정강이를 -90° 되돌린다. 각도 규약은 StudyRoomJointAngles와 같다.
import { StudyRoomJointAngles as A, StudyRoomPose, type StudyRoomJointMap } from './motion'

/** 선 사람의 원점(앉은 방석 높이 기준점)이 발바닥보다 높은 만큼(m): 허벅지 0.075 + 0.115 내려간 무릎 아래 정강이 0.106. */
export const standingLift = 0.146

const down = Math.PI / 2

function legs(swing: number, kneeL: number, kneeR: number): StudyRoomJointMap {
  return {
    upperLegL: new A({ pitch: down + swing }),
    upperLegR: new A({ pitch: down - swing }),
    lowerLegL: new A({ pitch: -down - kneeL }),
    lowerLegR: new A({ pitch: -down - kneeR }),
  }
}

/** 팔을 몸 옆으로 내린다(기본 자세는 책상 위에 올린 팔). swing이 +면 왼팔이 앞. */
function arms(swing: number): StudyRoomJointMap {
  return {
    upperArmL: new A({ pitch: 1.15 - swing, roll: -0.18 }),
    upperArmR: new A({ pitch: 1.15 + swing, roll: 0.18 }),
    lowerArmL: new A({ pitch: -0.35 }),
    lowerArmR: new A({ pitch: -0.35 }),
  }
}

/** 가만히 선 자세. t초에 따라 숨 쉬듯 몸통·고개가 아주 조금 움직인다. */
export function standingPose(t: number): StudyRoomPose {
  const breathe = Math.sin(t * 2.1)
  return new StudyRoomPose({
    joints: {
      ...legs(0, 0, 0),
      ...arms(0.04 * breathe),
      torso: new A({ pitch: 0.02 * breathe }),
      neck: new A({ pitch: -0.04 + 0.03 * Math.sin(t * 1.3), yaw: 0.08 * Math.sin(t * 0.7) }),
    },
  })
}

/** 걷는 자세. phase는 걸음 주기(라디안, 2π에 두 걸음). amount 0–1로 선 자세와 섞는다. */
export function walkingPose(phase: number, amount = 1): StudyRoomPose {
  const s = Math.sin(phase) * 0.55 * amount
  const kneeL = Math.max(0, -Math.sin(phase)) * 0.7 * amount
  const kneeR = Math.max(0, Math.sin(phase)) * 0.7 * amount
  return new StudyRoomPose({
    joints: {
      ...legs(s, kneeL, kneeR),
      ...arms(s * 0.9),
      torso: new A({ pitch: 0.06 * amount, yaw: 0.08 * Math.sin(phase) * amount }),
      neck: new A({ pitch: -0.05, yaw: -0.06 * Math.sin(phase) * amount }),
    },
  })
}

/** 걸을 때 위아래로 튀는 높이(m). 한 걸음마다 한 번. */
export function walkBob(phase: number, amount = 1): number {
  return Math.abs(Math.sin(phase)) * 0.025 * amount
}

// ---------------------------------------------------------------------------
// 온보딩 캐릭터 고르기: 남자·여자가 서로 다른 기다리는 동작(idle)과 골랐을 때 동작.

export type ActorGender = 'male' | 'female'
/** 자세와 함께 사람 전체가 움직이는 몫: lift는 위로 뜬 높이(m), yaw는 제자리에서 돈 각도(라디안). */
export type ActorMotion = { pose: StudyRoomPose; lift: number; yaw: number }

/** 고른 동작이 한 번 도는 시간(초). */
export const selectSeconds = 1.8

const sin = Math.sin

/** 둘 다 무릎을 굽힌 서기. b는 굽힌 정도(라디안): 허벅지가 앞으로 b, 정강이는 수직을 지키게 b만큼 되돌린다. */
function squat(b: number, tuck = 0): StudyRoomJointMap {
  return {
    upperLegL: new A({ pitch: down + b + tuck }),
    upperLegR: new A({ pitch: down + b + tuck }),
    lowerLegL: new A({ pitch: -down - b - tuck * 2 }),
    lowerLegR: new A({ pitch: -down - b - tuck * 2 }),
  }
}

/**
 * 가만히 기다리는 동작. 남자: 들썩이며 통통 튀고 팔을 흔들고 두리번거린다. 여자: 두 손을 앞에 모으고 천천히
 * 몸을 흔들며 고개를 갸웃하고 발끝을 톡톡 찍는다. t는 초(사람마다 시작 시각을 달리해 둘이 같이 움직이지 않게 한다).
 */
export function idleMotion(g: ActorGender, t: number): ActorMotion {
  if (g === 'male') {
    const bounce = 0.5 + 0.5 * sin(t * 6.2)
    return {
      pose: new StudyRoomPose({
        joints: {
          ...squat(0.14 * (1 - bounce)),
          ...arms(0.22 * sin(t * 3.1)),
          torso: new A({ pitch: 0.03, roll: 0.05 * sin(t * 3.1) }),
          neck: new A({ pitch: -0.05, yaw: 0.45 * sin(t * 0.8) * Math.min(1, 1.6 * Math.abs(sin(t * 0.4)) + 0.3) }),
        },
      }),
      lift: 0.014 * bounce,
      yaw: 0.06 * sin(t * 1.3),
    }
  }
  const tap = Math.max(0, sin(t * 2.6)) * (sin(t * 0.35) > 0.2 ? 1 : 0)
  return {
    pose: new StudyRoomPose({
      joints: {
        ...legs(0, 0, 0),
        upperLegR: new A({ pitch: down - 0.12 * tap }),
        lowerLegR: new A({ pitch: -down + 0.12 * tap }),
        // 두 손을 배 앞에 모은다.
        upperArmL: new A({ pitch: 0.75, roll: 0.3 }),
        upperArmR: new A({ pitch: 0.75, roll: -0.3 }),
        lowerArmL: new A({ pitch: -1.15 }),
        lowerArmR: new A({ pitch: -1.15 }),
        torso: new A({ pitch: 0.02, roll: 0.07 * sin(t * 1.5) }),
        neck: new A({ pitch: -0.02, roll: 0.14 * sin(t * 1.1 + 0.8), yaw: 0.1 * sin(t * 0.6) }),
      },
    }),
    lift: 0,
    yaw: 0.1 * sin(t * 1.5),
  }
}

const ease = (x: number) => x * x * (3 - 2 * x)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/**
 * 골랐을 때 동작(k는 0–1 진행). 남자: 웅크렸다가 팔을 번쩍 들며 높이 뛴다. 여자: 두 팔을 벌리고 한 바퀴 돌며
 * 살짝 뛴다. 시작·끝에서 기다리는 동작과 부드럽게 이어진다(여자는 정확히 한 바퀴라 방향도 그대로 돌아온다).
 */
export function selectMotion(g: ActorGender, t: number, k: number): ActorMotion {
  const idle = idleMotion(g, t)
  const env = ease(clamp01(k / 0.12)) * ease(clamp01((1 - k) / 0.12))
  let pose: StudyRoomPose
  let lift = 0
  let yaw = 0
  if (g === 'male') {
    const crouch = ease(clamp01(k / 0.22)) * (1 - ease(clamp01((k - 0.22) / 0.08)))
    const air = clamp01((k - 0.26) / 0.46)
    const jump = sin(air * Math.PI)
    const pump = ease(clamp01((k - 0.2) / 0.2)) * (1 - ease(clamp01((k - 0.85) / 0.15)))
    lift = 0.3 * jump - 0.03 * crouch
    pose = new StudyRoomPose({
      joints: {
        ...squat(0.55 * crouch, 0.35 * jump),
        upperArmL: new A({ pitch: 1.15 - 1.6 * pump, roll: -0.35 * pump }),
        lowerArmL: new A({ pitch: -1.3 * pump }),
        // 오른 주먹을 머리 위로 번쩍.
        upperArmR: new A({ pitch: 1.15 - 3.1 * pump, roll: 0.25 * pump }),
        lowerArmR: new A({ pitch: -0.35 - 0.3 * pump }),
        torso: new A({ pitch: 0.3 * crouch - 0.12 * jump }),
        neck: new A({ pitch: -0.2 * jump }),
      },
      mouthOpen: 0.9 * jump,
    })
  } else {
    const spin = ease(clamp01((k - 0.1) / 0.7))
    const hop = sin(clamp01((k - 0.2) / 0.5) * Math.PI)
    yaw = Math.PI * 2 * spin
    lift = 0.12 * hop
    const out = ease(clamp01((k - 0.05) / 0.2)) * (1 - ease(clamp01((k - 0.8) / 0.2)))
    pose = new StudyRoomPose({
      joints: {
        ...squat(0.1 * (1 - hop), 0.25 * hop),
        upperArmL: new A({ pitch: 1.15 - 0.85 * out, roll: -1.05 * out }),
        upperArmR: new A({ pitch: 1.15 - 0.85 * out, roll: 1.05 * out }),
        lowerArmL: new A({ pitch: -0.35 + 0.1 * out }),
        lowerArmR: new A({ pitch: -0.35 + 0.1 * out }),
        torso: new A({ roll: 0.1 * sin(spin * Math.PI * 2) }),
        neck: new A({ pitch: -0.1 * out, roll: 0.15 * out }),
      },
      mouthOpen: 0.7 * hop,
    })
  }
  return { pose: StudyRoomPose.lerp(idle.pose, pose, env), lift: idle.lift + (lift - idle.lift) * env, yaw: idle.yaw * (1 - env) + yaw * env }
}

/**
 * 머리 위 이름표를 의식하듯 올려다본다(이름 정하기 단계). amount 0–1로 원래 자세와 섞는다. 고개를 들고 몸을 살짝
 * 젖히며, 이름표를 확인하듯 고개를 아주 조금씩 끄덕이고 좌우로 갸웃한다.
 */
export function lookUpAt(pose: StudyRoomPose, amount: number, t: number): StudyRoomPose {
  if (amount <= 0) return pose
  const neck = pose.joint('neck')
  const torso = pose.joint('torso')
  const mix = (from: number, to: number) => from + (to - from) * amount
  return new StudyRoomPose({
    joints: {
      ...pose.joints,
      neck: new A({
        pitch: mix(neck.pitch, -0.4 + 0.05 * sin(t * 2.3)),
        yaw: mix(neck.yaw, 0.12 * sin(t * 1.1)),
        roll: mix(neck.roll, 0.1 * sin(t * 0.9 + 1)),
      }),
      torso: new A({ pitch: mix(torso.pitch, -0.04), yaw: torso.yaw, roll: torso.roll }),
    },
    props: pose.props,
    lift: pose.lift,
    eyeOpen: pose.eyeOpen,
    mouthOpen: pose.mouthOpen,
    leaf: pose.leaf,
  })
}
