// 원본 widgets/study_lp_player.dart: 받침·판·톤암 그림을 겹친 턴테이블. 판은 비스듬한 원(세로 0.61566배)으로
// 돌고, 켜고 끌 때 속도가 0.45초 시정수로 붙고 줄어든다. 재생 중에는 음표가 판 양옆에서 떠오른다.
import { useEffect, useRef, type ReactNode } from 'react'
import { IconMusic, IconVinyl } from '@tabler/icons-react'
import s from './sound.module.css'

const base = '/assets/study/music/'
const layout = { aspect: 1.25, cx: 0.40387, cy: 0.41755, radius: 0.22903, imageScale: 1.02, squash: 0.61566 }
const speed = (2 * Math.PI) / 2.4
const ease = 0.45
export const labelFraction = 0.36

export function LpPlayer(props: { playing: boolean; label: ReactNode; center?: ReactNode }) {
  const disc = useRef<HTMLDivElement>(null)
  const notes = useRef<HTMLDivElement>(null)
  const playing = useRef(props.playing)
  playing.current = props.playing
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (reduce) return
    let raf = 0
    let last = 0
    let angle = 0
    let velocity = 0
    let clock = 0
    const tick = (now: number) => {
      const dt = last ? (now - last) / 1000 : 0
      last = now
      const target = playing.current ? speed : 0
      velocity += (target - velocity) * (1 - Math.exp(-dt / ease))
      if (!playing.current && velocity < 0.02) velocity = 0
      angle = (angle + velocity * dt) % (Math.PI * 2)
      clock += dt
      if (disc.current) disc.current.style.transform = `scaleY(${layout.squash}) rotate(${angle}rad)`
      const strength = Math.min(1, velocity / speed)
      notes.current?.querySelectorAll<HTMLElement>('[data-note]').forEach((el, i) => {
        const t = (clock / 3.2 + i / 3) % 1
        const side = i % 2 === 0 ? -1 : 1
        const x = side * (0.55 + (0.25 * i) / 3) + Math.sin(t * Math.PI * 2) * 0.05
        const y = -0.35 - t * 0.8
        el.style.transform = `translate(calc(${x} * var(--spread) - 50%), calc(${y} * var(--spread) - 50%)) scale(${(16 + 4 * (1 - t)) / 20})`
        el.style.opacity = String(Math.sin(t * Math.PI) * strength)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduce])
  const side = layout.radius * 2 * layout.imageScale * 100
  const discStyle = { left: `${layout.cx * 100 - side / 2}%`, top: `${layout.cy * 100 - (side / 2) * layout.aspect}%`, width: `${side}%`, aspectRatio: '1' }
  return (
    <div className={s.lp} aria-hidden="true">
      <div className={s.lpShadow} />
      <img className={s.layer} src={`${base}lp_base.webp`} alt="" draggable={false} />
      <div className={s.lpDisc} style={discStyle}>
        <div ref={disc} className={s.lpSpin}>
          <img className={s.layer} src={`${base}lp_record.webp`} alt="" draggable={false} />
          <div className={s.lpLabel}>{props.label}</div>
        </div>
      </div>
      <img className={s.layer} style={{ opacity: props.playing ? 0 : 1 }} src={`${base}lp_arm_rest.webp`} alt="" draggable={false} />
      <img className={s.layer} style={{ opacity: props.playing ? 1 : 0 }} src={`${base}lp_arm_play.webp`} alt="" draggable={false} />
      {props.center && <div className={s.lpCenter} style={discStyle}>{props.center}</div>}
      {!reduce && (
        <div ref={notes} className={s.lpNotes} style={{ left: `${layout.cx * 100}%`, top: `${layout.cy * 100}%`, ['--spread' as string]: `${side / 2}cqw` }}>
          <span data-note><IconMusic size={20} /></span>
          <span data-note><IconVinyl size={20} /></span>
          <span data-note><IconMusic size={20} /></span>
        </div>
      )}
    </div>
  )
}

/** 원본 StudyVinylLabel: 판 가운데 색 동그라미(옅은 흰 테두리)와 아이콘. */
export function VinylLabel(props: { color: string; icon: ReactNode; iconColor: string }) {
  return (
    <div className={s.vinylLabel}>
      <div className={s.vinylFace} style={{ background: props.color, color: props.iconColor }}>{props.icon}</div>
    </div>
  )
}

/** 원본 StudyVinylDisc: 판 그림 + 라벨. spinning이면 4초에 한 바퀴. */
export function VinylDisc(props: { size: number; label: ReactNode; spinning?: boolean }) {
  return (
    <div className={props.spinning ? `${s.disc} ${s.discSpin}` : s.disc} style={{ width: props.size, height: props.size }}>
      <img className={s.layer} src={`${base}lp_record.webp`} alt="" draggable={false} />
      <div className={s.discLabel}>{props.label}</div>
    </div>
  )
}
