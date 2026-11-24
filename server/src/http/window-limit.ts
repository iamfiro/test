/**
 * 프로세스 메모리의 이동 창 횟수 제한(참여·초대 미리보기·태그 제안). 서버 1대 출시(결정 M7)라 메모리로 충분하고,
 * 재시작하면 창이 비는 것을 받아들인다. 서버를 늘리면 DB나 공유 저장소로 옮긴다.
 */
export class WindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private sinceSweep = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => Date,
  ) {}

  /** 한 번 쓴다. 이미 상한이면 쓰지 않고 다시 시도할 수 있을 때까지의 초를 돌려준다. */
  take(key: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const at = this.now().getTime();
    this.sweep(at);
    const recent = (this.hits.get(key) ?? []).filter((t) => t > at - this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      const retryMs = recent[recent.length - this.max]! + this.windowMs - at;
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
    }
    recent.push(at);
    this.hits.set(key, recent);
    return { ok: true };
  }

  /** 가끔 창 밖으로 나간 키를 지운다(메모리가 쌓이지 않게). */
  private sweep(at: number): void {
    this.sinceSweep += 1;
    if (this.sinceSweep < 1000) return;
    this.sinceSweep = 0;
    for (const [key, times] of this.hits) {
      if (times.every((t) => t <= at - this.windowMs)) this.hits.delete(key);
    }
  }
}
