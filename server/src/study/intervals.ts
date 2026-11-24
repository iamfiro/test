/** 반열린 구간 [start, end) 목록 연산. 값은 epoch 밀리초. */
export type Interval = readonly [number, number];

/** 정렬하고 겹치거나 맞닿은 구간을 합친다. 길이 0 이하는 버린다. */
export function union(intervals: Iterable<Interval>): Interval[] {
  const sorted = [...intervals].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

export function intersect(left: Iterable<Interval>, right: Iterable<Interval>): Interval[] {
  const a = union(left);
  const b = union(right);
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i]![0], b[j]![0]);
    const end = Math.min(a[i]![1], b[j]![1]);
    if (end > start) result.push([start, end]);
    if (a[i]![1] < b[j]![1]) i++;
    else j++;
  }
  return result;
}

export const totalMs = (intervals: Iterable<Interval>) => {
  let sum = 0;
  for (const [a, b] of intervals) sum += b - a;
  return sum;
};
