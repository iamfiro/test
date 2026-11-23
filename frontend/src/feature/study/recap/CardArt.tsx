// 화면 속 "오늘의 공부" 시트. cardDraw.ts의 같은 그리기 함수로 시트 한 장을 캔버스에 그린다.
// 들어올 때 시트가 기울며 올라오고, 마우스를 올리면 살짝 기운다(움직임 줄이기면 끈다).
import { useEffect, useRef, type PointerEvent } from 'react'
import { drawSheet, sheet, type CardAssets } from './cardDraw'
import type { StudyRecap } from './studyRecap'
import s from './recap.module.css'

/** 시트 무대 여백: 기울임·그림자 자리. */
const stage = { left: 20, top: 20, right: 20, bottom: 24 } as const
export const stageSize = { width: stage.left + sheet.width + stage.right, height: stage.top + sheet.height + stage.bottom } as const

/** 캔버스 화소 배율: 기울임·확대에도 또렷하게 기기 배율보다 조금 높게. */
const layerScale = () => Math.min(3.5, Math.max(2, window.devicePixelRatio || 1) * 1.5)

export function CardArt({ recap, assets, label }: { recap: StudyRecap; assets: CardAssets; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const tilt = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const scale = layerScale()
    el.width = Math.ceil(sheet.width * scale)
    el.height = Math.ceil(sheet.height * scale)
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.imageSmoothingQuality = 'high'
    drawSheet(ctx, recap, assets)
  }, [recap, assets])

  const fine = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = tilt.current
    if (!el || !fine) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--tilt-x', `${(-y * 6).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`)
  }
  const onLeave = () => {
    const el = tilt.current
    if (!el) return
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
  }

  return (
    <div className={s.art} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={onLeave} style={{ width: stageSize.width, height: stageSize.height }}>
      <div className={s.tilt} ref={tilt} style={{ left: stage.left, top: stage.top }}>
        <div className={s.card}>
          <canvas ref={canvas} aria-hidden="true" className={s.cardBase} style={{ width: sheet.width, height: sheet.height }} />
        </div>
      </div>
    </div>
  )
}
