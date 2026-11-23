// 원본 widgets/study_sound_panel.dart: 햇살 노랑 테두리 안 크림 종이 패널. 턴테이블(누르면 재생·멈춤),
// 음반 선반, 배경 음악 볼륨, 환경음 믹서. 화면 아래에서 올라오고, 바깥을 누르거나 닫기로 내려간다.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  IconBook2, IconCheck, IconCloudRain, IconCoffee, IconFlame, IconHeadphones, IconKeyboard, IconPencil,
  IconPlayerPauseFilled, IconPlayerPlayFilled, IconVinyl, IconWaveSine,
} from '@tabler/icons-react'
import { t, type MessageKey } from '../../../l10n/t'
import { LpPlayer, VinylDisc, VinylLabel } from './LpPlayer'
import {
  ambientSounds, currentRecord, isPlaying, musicChannel, records, setAmbientLevel, setVolume, toggleRecord,
  togglePlayback, useSound, volumeOf, type AmbientSound, type StudyRecord,
} from './soundStore'
import s from './sound.module.css'

const ambientLabel: Record<AmbientSound, MessageKey> = {
  white_noise: 'studySoundWhiteNoise', rain: 'studySoundRain', cafe: 'studySoundCafe', pencil: 'studySoundPencil',
  pages: 'studySoundPages', keyboard: 'studySoundKeyboard', fire: 'studySoundFire',
}
/** 효과음 표시 색: 섬 팔레트에 맞춘 파스텔(원본 _labelColor). */
const ambientColor: Record<AmbientSound, string> = {
  white_noise: '#E6E0F2', rain: '#BFDDF0', cafe: '#E8C39E', pencil: '#FFD9BC', pages: '#F7E7B0', keyboard: '#CDE8C8', fire: '#F7B49A',
}
const ambientIcon: Record<AmbientSound, ReactNode> = {
  white_noise: <IconWaveSine size={16} />, rain: <IconCloudRain size={16} />, cafe: <IconCoffee size={16} />, pencil: <IconPencil size={16} />,
  pages: <IconBook2 size={16} />, keyboard: <IconKeyboard size={16} />, fire: <IconFlame size={16} />,
}
const recordLabel = (r: StudyRecord) => (r.id === 'cafe' ? t('studySoundCafeMusic') : r.id)
const percent = (v: number) => `${Math.round(v * 100)}%`

export function SoundPanel(props: { open: boolean; onClose: () => void }) {
  // 닫힐 때 내려가는 움직임이 끝난 뒤에 지운다.
  const [mounted, setMounted] = useState(props.open)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (props.open) {
      setMounted(true)
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const id = window.setTimeout(() => setMounted(false), 260)
    return () => window.clearTimeout(id)
  }, [props.open])
  useEffect(() => {
    if (!props.open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.open, props.onClose])
  if (!mounted) return null
  return (
    <div className={`palette-day ${s.root} ${shown ? s.shown : ''}`}>
      <button type="button" className={s.barrier} aria-label={t('studySoundClose')} onClick={props.onClose} />
      <section className={s.panel} role="dialog" aria-modal="true" aria-label={t('studySoundTitle')}>
        <div className={s.frame}>
          <div className={s.paper}>
            <Content onClose={props.onClose} />
          </div>
        </div>
      </section>
    </div>
  )
}

function Content(props: { onClose: () => void }) {
  const state = useSound()
  const playing = isPlaying(state)
  const musicOn = state.settings.enabled.includes(musicChannel)
  const record = currentRecord()
  const summary = playing
    ? [musicOn ? recordLabel(record) : null, ...ambientSounds.filter((a) => state.settings.enabled.includes(a)).map((a) => t(ambientLabel[a]))].filter(Boolean).join(' · ')
    : t('studySoundPaused')
  return (
    <div className={s.content}>
      <button type="button" className={s.close} onClick={props.onClose} aria-label={t('studySoundClose')} title={t('studySoundClose')}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
      </button>
      <div className={s.turntableCol}>
        <header className={s.header}>
          <span className={s.badge}><IconVinyl size={22} /></span>
          <h2 className={s.title}>{t('studySoundTitle')}</h2>
        </header>
        <button type="button" className={s.turntable} onClick={togglePlayback} aria-label={playing ? t('studySoundPauseAll') : t('studySoundPlayAll')}>
          <LpPlayer
            playing={playing}
            label={musicOn
              ? <VinylLabel color={record.color} iconColor="var(--i-ink)" icon={<IconHeadphones />} />
              : <VinylLabel color="var(--i-paper)" iconColor="var(--i-ink-soft)" icon={<IconVinyl />} />}
            center={<span className={playing ? `${s.playBadge} ${s.playBadgeHidden}` : s.playBadge}><IconPlayerPlayFilled size={26} /></span>}
          />
        </button>
        <div className={s.nowPlaying} aria-live="polite">
          <span className={playing ? `${s.pill} ${s.pillOn}` : s.pill}>
            {playing ? <IconPlayerPlayFilled size={14} /> : <IconPlayerPauseFilled size={14} />}
            <span>{summary}</span>
          </span>
        </div>
      </div>
      <div className={s.controlsCol}>
        <div className={s.shelf}>
          {records.map((r) => {
            const selected = musicOn && record.id === r.id
            return (
              <button key={r.id} type="button" className={s.record} onClick={() => toggleRecord(r)} aria-pressed={selected} aria-label={`${t('studySoundMusic')}, ${recordLabel(r)}`}>
                <span className={selected ? `${s.recordDisc} ${s.recordSelected}` : s.recordDisc}>
                  <VinylDisc size={64} spinning={selected && playing} label={<VinylLabel color={selected ? r.color : 'var(--i-paper)'} iconColor={selected ? 'var(--i-ink)' : 'var(--i-ink-soft)'} icon={<IconHeadphones />} />} />
                  {selected && <span className={s.check}><IconCheck size={12} stroke={3} /></span>}
                </span>
                <span className={selected ? `${s.recordName} ${s.on}` : s.recordName}>{recordLabel(r)}</span>
              </button>
            )
          })}
        </div>
        {musicOn && (
          <div className={s.row}>
            <VinylDisc size={30} label={<VinylLabel color={record.color} iconColor="var(--i-ink)" icon={<IconHeadphones />} />} />
            <span className={`${s.rowTitle} ${s.on}`}>{recordLabel(record)}</span>
            <Volume label={recordLabel(record)} value={volumeOf(state.settings, musicChannel)} onChange={(v) => setVolume(musicChannel, v)} />
          </div>
        )}
        <h3 className={s.sectionTitle}>{t('studySoundAmbient')}</h3>
        <div className={s.ambient}>
          {ambientSounds.map((a) => {
            const on = state.settings.enabled.includes(a)
            return (
              <div key={a} className={s.row}>
                <span className={s.ambientIcon} style={{ background: on ? ambientColor[a] : 'var(--i-paper)', color: on ? 'var(--i-ink)' : 'var(--i-ink-soft)' }}>{ambientIcon[a]}</span>
                <span className={on ? `${s.rowTitle} ${s.on}` : s.rowTitle}>{t(ambientLabel[a])}</span>
                <Volume label={t(ambientLabel[a])} value={on ? volumeOf(state.settings, a) : 0} onChange={(v) => setAmbientLevel(a, v)} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Volume(props: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <span className={s.volume}>
      <input
        type="range" min={0} max={1} step={0.01} value={props.value}
        aria-label={t('studySoundVolume', { sound: props.label })} aria-valuetext={percent(props.value)}
        style={{ '--fill': `${props.value * 100}%` } as CSSProperties}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className={s.percent}>{percent(props.value)}</span>
    </span>
  )
}
