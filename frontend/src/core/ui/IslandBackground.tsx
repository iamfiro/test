import { useEffect, useRef } from 'react'

export type IslandGround = 'grass' | 'meadow' | 'lake'

const groundVars: Record<IslandGround, [string, string]> = {
  grass: ['--i-grass', '--i-grass-pattern'],
  meadow: ['--i-meadow', '--i-meadow-pattern'],
  lake: ['--i-lake', '--i-lake-pattern'],
}

/**
 * 원본: StudyRoomIslandBackground + _ClockFieldPainter. 바탕색 위에 작은 시계를 흩뿌린 고정 배경.
 * 칸 위치 흔들림은 Dart 64비트 정수 XOR와 같게 BigInt로 계산한다(JS `^`는 32비트라 결과가 다르다).
 */
export function IslandBackground(props: { ground?: IslandGround; colors?: [string, string]; showPattern?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [groundVar, patternVar] = groundVars[props.ground ?? 'grass']
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const css = getComputedStyle(canvas)
      const ground = props.colors?.[0] ?? css.getPropertyValue(groundVar).trim()
      const pattern = props.colors?.[1] ?? css.getPropertyValue(patternVar).trim()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paintClockField(ctx, w, h, ground, pattern, props.showPattern ?? true)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', draw)
    return () => { ro.disconnect(); mq.removeEventListener('change', draw) }
  }, [groundVar, patternVar, props.colors?.[0], props.colors?.[1], props.showPattern])
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0 }} />
}

const CELL = 60

export function paintClockField(ctx: CanvasRenderingContext2D, w: number, h: number, ground: string, pattern: string, showPattern: boolean) {
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, w, h)
  if (!showPattern) return
  ctx.strokeStyle = pattern
  ctx.fillStyle = pattern
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  const cols = Math.ceil(w / CELL) + 1
  const rows = Math.ceil(h / CELL) + 1
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const seed = Number((BigInt(row) * 73856093n) ^ (BigInt(col) * 19349663n))
      const jx = ((seed & 0xff) / 255 - 0.5) * CELL * 0.4
      const jy = ((Math.floor(seed / 256) & 0xff) / 255 - 0.5) * CELL * 0.4
      const x = col * CELL + (row % 2 === 1 ? CELL / 2 : 0) + jx
      const y = row * CELL + jy
      const r = seed % 3 === 0 ? 9 : 7
      ctx.lineCap = 'butt'
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()
      const hour = ((Math.floor(seed / 65536) & 0xf) / 16) * 2 * Math.PI
      const minute = ((Math.floor(seed / 1048576) & 0xf) / 16) * 2 * Math.PI
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(hour) * r * 0.45, y - Math.cos(hour) * r * 0.45)
      ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(minute) * r * 0.7, y - Math.cos(minute) * r * 0.7)
      ctx.stroke()
      ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill()
    }
  }
}
