// 원본: (대응 파일 없음) Flutter dart:ui Color(0xAARRGGBB)·Color.lerp·Color.from 의미 이식 (PocketTime f574f242, Flutter 3.44)

import { clampDouble } from '../domain/dartMath';

/**
 * Flutter `Color`. Flutter 3.27부터 Color는 채널을 0–1 실수로 담는다(`a`·`r`·`g`·`b`).
 * 같은 표현을 써서 Color.lerp·Color.from 계산이 Flutter와 비트 단위로 같게 한다.
 * 알파가 1이 아니면 그대로 남는다.
 */
export interface StudyRoomColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/**
 * `Color(0xAARRGGBB)`. Flutter는 각 8비트 채널을 `(c & 0xff) / 255`로 나눈다.
 * 32비트 값이 2^31을 넘으므로 `>>>`(부호 없는 이동)으로 뽑는다.
 */
export function colorFromArgb(value: number): StudyRoomColor {
  return {
    a: ((value >>> 24) & 0xff) / 255,
    r: ((value >>> 16) & 0xff) / 255,
    g: ((value >>> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

/** `Color.from(alpha:, red:, green:, blue:)`. 값을 자르지 않는다. */
export function colorFrom(c: { alpha: number; red: number; green: number; blue: number }): StudyRoomColor {
  return { a: c.alpha, r: c.red, g: c.green, b: c.blue };
}

/** dart:ui `_lerpDouble`: `a * (1 - t) + b * t`(무한대·NaN 처리 때문에 이 식을 쓴다). */
function lerpDouble(a: number, b: number, t: number): number {
  return a * (1.0 - t) + b * t;
}

/** `Color.lerp(x, y, t)`(둘 다 sRGB). 채널마다 섞고 0–1로 자른다. */
export function colorLerp(x: StudyRoomColor, y: StudyRoomColor, t: number): StudyRoomColor {
  return {
    a: clampDouble(lerpDouble(x.a, y.a, t), 0, 1),
    r: clampDouble(lerpDouble(x.r, y.r, t), 0, 1),
    g: clampDouble(lerpDouble(x.g, y.g, t), 0, 1),
    b: clampDouble(lerpDouble(x.b, y.b, t), 0, 1),
  };
}

/** Flutter `Color ==`(채널 실수 비교). */
export function colorEquals(x: StudyRoomColor, y: StudyRoomColor): boolean {
  return x.a === y.a && x.r === y.r && x.g === y.g && x.b === y.b;
}

/**
 * 렌더러 편의: '#RRGGBB'. Flutter `toARGB32`처럼 `(c * 255).round()`로 8비트에 맞춘다.
 * 알파는 담지 않으니 알파가 필요하면 `a`를 따로 쓴다.
 */
export function colorToHex(c: StudyRoomColor): string {
  const channel = (v: number) => Math.round(clampDouble(v, 0, 1) * 255).toString(16).padStart(2, '0');
  return `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`;
}
