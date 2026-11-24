// 생각 말풍선의 울퉁불퉁한 구름 테두리(SVG path). 내용 칸(w×h)을 감싸는 둥근 네모꼴(초타원) 둘레에 고르게 점을 찍고,
// 이웃한 점을 바깥으로 부푼 호로 잇는다. 혹 크기는 자리마다 조금씩 달라(고정된 값) 손으로 그린 구름처럼 보인다.

/** 내용 칸 밖으로 구름이 부푸는 여백(px). SVG는 이만큼 내용보다 크게 둔다. */
export const cloudMargin = 16

/** 혹 하나의 대략적인 너비(px). */
const bumpSpan = 30

export function cloudPath(w: number, h: number): string {
  const a = w / 2 + 6
  const b = h / 2 + 6
  const cx = w / 2
  const cy = h / 2
  // 초타원 지수: 4에 가까울수록 네모, 2면 타원. 낮은 말풍선(한 줄 칩)은 네모에 가깝게 감싼다.
  const n = 3.2
  const point = (t: number) => {
    const c = Math.cos(t)
    const s = Math.sin(t)
    return [cx + a * Math.sign(c) * Math.abs(c) ** (2 / n), cy + b * Math.sign(s) * Math.abs(s) ** (2 / n)] as const
  }
  // 둘레를 잘게 재서 같은 길이마다 점을 찍는다(초타원은 각도로 나누면 모서리에 몰린다).
  const steps = 360
  const samples: (readonly [number, number])[] = []
  const lengths: number[] = [0]
  for (let i = 0; i <= steps; i++) {
    const p = point((i / steps) * Math.PI * 2)
    if (i > 0) {
      const q = samples[i - 1]!
      lengths.push(lengths[i - 1]! + Math.hypot(p[0] - q[0], p[1] - q[1]))
    }
    samples.push(p)
  }
  const total = lengths[steps]!
  const count = Math.max(7, Math.round(total / bumpSpan))
  const points: (readonly [number, number])[] = []
  let j = 0
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total
    while (j < steps && lengths[j + 1]! < target) j++
    const span = lengths[j + 1]! - lengths[j]!
    const f = span > 0 ? (target - lengths[j]!) / span : 0
    const p = samples[j]!
    const q = samples[j + 1]!
    points.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f])
  }
  // 화면 좌표(y 아래)에서 각도가 늘면 시계 방향으로 돈다. 시계 방향 작은 호(sweep 1)는 중심이 안쪽이라 바깥으로 부푼다.
  let d = `M ${fmt(points[0]![0])} ${fmt(points[0]![1])}`
  for (let k = 0; k < count; k++) {
    const p = points[k]!
    const q = points[(k + 1) % count]!
    const chord = Math.hypot(q[0] - p[0], q[1] - p[1])
    const r = chord * (0.56 + 0.1 * wobble(k))
    d += ` A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(q[0])} ${fmt(q[1])}`
  }
  return `${d} Z`
}

/** 자리마다 고정된 0–1 값(혹 크기를 조금씩 다르게). */
function wobble(k: number): number {
  const x = Math.sin(k * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toString()
