// 원본: (대응 파일 없음) Dart 산술 의미(%·~/·clamp·compareTo·List 인덱스)를 JS에서 그대로 내는 보조 (PocketTime f574f242 이식용)

/**
 * Dart의 `%`. Dart는 나머지가 늘 0 이상이다(-1 % 24 == 23). JS `%`는 나누는 수의 부호를
 * 따라 음수가 나오므로 나누는 수의 절댓값을 더해 맞춘다. 0이 나오면 Dart VM처럼 +0으로 바꾼다.
 */
export function dartMod(a: number, b: number): number {
  const r = a % b;
  if (r === 0) return 0;
  if (r < 0) return b < 0 ? r - b : r + b;
  return r;
}

/** Dart의 `~/`(0 쪽으로 버리는 정수 나눗셈). 안전한 정수 범위에서만 Dart와 같다. */
export function dartTruncDiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/**
 * Dart `num.clamp`. 아래가 위보다 크면 ArgumentError처럼 던지고, 아래 한계가 NaN이면 그것을,
 * 값이 NaN이면(Dart compareTo에서 NaN은 가장 크다) 위 한계를 준다.
 */
export function dartClamp(x: number, lower: number, upper: number): number {
  if (dartCompare(lower, upper) > 0) {
    throw new RangeError(`Invalid argument: ${lower} > ${upper}`);
  }
  if (Number.isNaN(lower)) return lower;
  if (x < lower) return lower;
  if (dartCompare(x, upper) > 0) return upper;
  return x;
}

/** dart:ui `clampDouble`(Color.lerp가 쓴다). NaN이면 위 한계. */
export function clampDouble(x: number, min: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  if (Number.isNaN(x)) return max;
  return x;
}

/** Dart `double.compareTo`: -0.0 < 0.0, NaN은 무엇보다 크다(NaN끼리는 같다). */
export function dartCompare(a: number, b: number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  if (a === b) {
    if (a === 0) {
      const negA = Object.is(a, -0);
      const negB = Object.is(b, -0);
      if (negA === negB) return 0;
      return negA ? -1 : 1;
    }
    return 0;
  }
  const nanA = Number.isNaN(a);
  const nanB = Number.isNaN(b);
  if (nanA && nanB) return 0;
  return nanA ? 1 : -1;
}

/** Dart `List[i]`: 범위를 벗어나면 RangeError를 던진다(noUncheckedIndexedAccess 대응). */
export function at<T>(list: readonly T[], index: number): T {
  if (index < 0 || index >= list.length || !Number.isInteger(index)) {
    throw new RangeError(`Index out of range: ${index} (length ${list.length})`);
  }
  return list[index] as T;
}
