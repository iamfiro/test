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

/** 반갑게 한 번 손 흔들기(고른 캐릭터). k는 0–1 진행. */
export function wavePose(t: number, k: number): StudyRoomPose {
  const base = standingPose(t)
  const up = Math.sin(Math.min(1, k) * Math.PI)
  const wag = Math.sin(k * Math.PI * 6) * 0.35 * up
  return new StudyRoomPose({
    joints: {
      ...base.joints,
      upperArmR: new A({ pitch: 1.15 - 2.6 * up, roll: 0.18 + 0.5 * up }),
      lowerArmR: new A({ pitch: -0.35 - 0.6 * up, roll: wag }),
      neck: new A({ pitch: -0.12 * up }),
    },
    mouthOpen: 0.6 * up,
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
