// 공부방 페이지 배경(StudyVillage 전용): 지구가 떠 있는 밤하늘. 짙은 남색 그라데이션, 지구 쪽 은은한 빛무리,
// 고정 무늬의 작은 별. 별 위치는 고정 시드로 만든다(새로고침해도 같다).
import { useEffect, useRef } from 'react'
import s from './rooms.module.css'

export function SpaceBackground() {
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
      ctx.clearRect(0, 0, w, h)
      let seed = 20261123
      const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296 }
      const count = Math.round((w * h) / 4200)
      for (let i = 0; i < count; i++) {
        const x = rand() * w
        const y = rand() * h
        const r = rand() < 0.08 ? 1.6 : 0.6 + rand() * 0.7
        ctx.fillStyle = `rgb(255 255 255 / ${0.35 + rand() * 0.55})`
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      }
    }
    paint()
    const ro = new ResizeObserver(paint)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])
  return (
    <div className={s.space} aria-hidden="true">
      <canvas ref={ref} className={s.stars} />
    </div>
  )
}
