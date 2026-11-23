import { useSyncExternalStore } from 'react'

/**
 * Flutter `Curves`의 값을 그대로 옮긴 곡선(flutter/lib/src/animation/curves.dart).
 * CSS cubic-bezier는 Flutter `Cubic(a, b, c, d)`와 같은 정의다.
 */
export type Cubic = readonly [number, number, number, number]

export const flutterCurves = {
  easeOut: [0.0, 0.0, 0.58, 1.0],
  easeIn: [0.42, 0.0, 1.0, 1.0],
  easeOutBack: [0.175, 0.885, 0.32, 1.275],
  easeInOutCubic: [0.645, 0.045, 0.355, 1.0],
  easeOutCubic: [0.215, 0.61, 0.355, 1.0],
  easeInCubic: [0.55, 0.055, 0.675, 0.19],
} as const satisfies Record<string, Cubic>

export function css(c: Cubic): string {
  return `cubic-bezier(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`
}

/**
 * AnimatedSwitcher의 나가는 자식은 값이 1→0으로 거꾸로 가며 reverseCurve(switchOutCurve)를
 * 그대로 쓴다. 1→0 키프레임에 같은 모양을 내려면 곡선을 뒤집어 넘긴다.
 */
export function reversed(c: Cubic): string {
  return css([1 - c[2], 1 - c[3], 1 - c[0], 1 - c[1]])
}

/** Flutter `Cubic.transform`(같은 이분 탐색, 오차 0.001). */
export function cubicAt(c: Cubic, t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const bez = (a: number, b: number, m: number) => 3 * a * (1 - m) * (1 - m) * m + 3 * b * (1 - m) * m * m + m * m * m
  let start = 0
  let end = 1
  for (let i = 0; i < 64; i++) {
    const mid = (start + end) / 2
    const x = bez(c[0], c[2], mid)
    if (Math.abs(t - x) < 0.001) return bez(c[1], c[3], mid)
    if (x < t) start = mid
    else end = mid
  }
  return bez(c[1], c[3], (start + end) / 2)
}

/** Flutter `Curves.elasticOut`(ElasticOutCurve, period 0.4). CSS 곡선으로 낼 수 없어 표본으로 그린다. */
export function elasticOut(t: number): number {
  const period = 0.4
  const s = period / 4
  return Math.pow(2, -10 * t) * Math.sin(((t - s) * (Math.PI * 2)) / period) + 1
}

/** 0..1을 같은 간격으로 count+1개 표본 낸 키프레임(사이는 선형). */
export function sampled(count: number, frame: (t: number) => Keyframe): Keyframe[] {
  return Array.from({ length: count + 1 }, (_, i) => frame(i / count))
}

/** Flutter Shadow·BoxShadow blurRadius → CSS blur 길이(sigma = r·0.57735 + 0.5, CSS blur = 2·sigma). */
export function cssBlur(flutterBlurRadius: number): number {
  return 2 * (flutterBlurRadius * 0.57735 + 0.5)
}

const query = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(query)
  list.addEventListener('change', onChange)
  return () => list.removeEventListener('change', onChange)
}

/** 원본 `MediaQuery.disableAnimationsOf(context)`. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
