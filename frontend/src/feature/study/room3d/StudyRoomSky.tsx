// 원본: lib/feature/study/room3d/widgets/study_room_sky.dart (PocketTime f574f242).
// 창밖 하늘: 시각에 따른 그라데이션, 낮에는 해와 빛무리, 밤에는 달과 별.
import { useEffect, useRef } from 'react'
import type { StudyRoomDaylight } from './domain/daylight'
import { colorToHex } from './model/color'
// 별 70개 위치: 원본 `math.Random(i * 7349 + 11)`을 Dart로 돌려 뽑은 값 그대로(JS 난수로는 같은 값이 안 나온다).
import stars from './skyStars.json'

export function StudyRoomSky({ daylight: d }: { daylight: StudyRoomDaylight }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paintSky(ctx, w, h, d)
    }
    paint()
    const ro = new ResizeObserver(paint)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [d])
  return <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }} />
}

/** 하늘 한 장(원본 _SkyPainter.paint). 3D 렌더러의 배경 텍스처에도 쓴다. */
export function paintSky(ctx: CanvasRenderingContext2D, w: number, h: number, d: StudyRoomDaylight) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, colorToHex(d.skyTop))
  g.addColorStop(1, colorToHex(d.skyBottom))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  if (d.stars > 0.01) {
    ctx.fillStyle = `rgb(255 255 255 / ${0.85 * d.stars})`
    for (const [x, y, s] of stars as [number, number, number][]) {
      ctx.beginPath(); ctx.arc(x * w, y * h, s, 0, Math.PI * 2); ctx.fill()
    }
  }
  const shortest = Math.min(w, h)
  const x = w * (0.12 + 0.76 * d.arc)
  if (d.sunUp) {
    const y = h * (0.55 - 0.4 * d.sunHeight)
    const r = shortest * 0.07
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2)
    glow.addColorStop(0, 'rgb(255 243 196 / 0.55)')
    glow.addColorStop(1, 'rgb(255 243 196 / 0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFF6D8'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  } else {
    const y = h * 0.22
    const r = shortest * 0.05
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6)
    glow.addColorStop(0, 'rgb(230 236 255 / 0.35)')
    glow.addColorStop(1, 'rgb(230 236 255 / 0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill()
    // 초승달: 둥근 달에서 조금 비켜 놓은 원을 덜어 낸다.
    ctx.fillStyle = '#F4F1DA'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.arc(x + r * 0.45, y - r * 0.2, r * 0.9, 0, Math.PI * 2, true)
    ctx.fill('evenodd')
  }
}
