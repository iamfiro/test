// 공부 사운드(원본 sound/model·viewmodel·application). 배경 음악(턴테이블의 음반 한 장, 곡을 차례로 반복)과
// 환경음(파일 하나를 반복)을 섞어 재생한다. 설정은 기기에만 둔다(원본 SharedPreferences `study.sound.v1`과 같은
// 모양을 localStorage에). 서버가 판정하는 값이 아니고 보는 사람 기기의 취향이라 기기 저장이 맞다.
import { useSyncExternalStore } from 'react'
import { logger } from '../../../core/log/log'

const log = logger('StudySound')

export const ambientSounds = ['white_noise', 'rain', 'cafe', 'pencil', 'pages', 'keyboard', 'fire'] as const
export type AmbientSound = (typeof ambientSounds)[number]
/** 배경 음악 채널 id는 원본처럼 'piano'(처음 음반 이름)를 유지한다. */
export const musicChannel = 'piano' as const
export type Channel = AmbientSound | typeof musicChannel

export type StudyRecord = { id: string; color: string; tracks: string[] }
/** 카페 lo-fi 음반. 출처는 public/assets/study/music/sources.json. */
export const cafeRecord: StudyRecord = {
  id: 'cafe',
  color: '#E8C39E',
  tracks: ['chill_lofi', 'lofi_chill', 'coffee_shop', 'study_session'].map((id) => `/assets/study/music/cafe/${id}.m4a`),
}
export const records = [cafeRecord]
const recordById = (id: string) => records.find((r) => r.id === id) ?? cafeRecord

export type SoundSettings = { enabled: Channel[]; volumes: Partial<Record<Channel, number>>; stopWithTimer: boolean; record: string }
export type SoundError = 'playback' | null
type State = { settings: SoundSettings; playing: boolean; error: SoundError }

const storageKey = 'study.sound.v1'
const defaults: SoundSettings = { enabled: [], volumes: {}, stopWithTimer: true, record: cafeRecord.id }
/** 새 채널은 절반 볼륨에서 시작한다(원본 volume 기본값). */
export const volumeOf = (s: SoundSettings, c: Channel) => s.volumes[c] ?? 0.5

function readSettings(): SoundSettings {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return defaults
    const json = JSON.parse(raw) as Partial<SoundSettings>
    const known = new Set<string>([musicChannel, ...ambientSounds])
    return {
      enabled: (json.enabled ?? []).filter((c): c is Channel => known.has(c)),
      volumes: json.volumes ?? {},
      stopWithTimer: json.stopWithTimer ?? true,
      record: typeof json.record === 'string' ? json.record : cafeRecord.id,
    }
  } catch (e) {
    log.warn('restore failed', { error: String(e) })
    return defaults
  }
}
function writeSettings(s: SoundSettings) {
  try { localStorage.setItem(storageKey, JSON.stringify(s)) } catch (e) { log.warn('save failed', { error: String(e) }) }
}

let state: State = { settings: readSettings(), playing: false, error: null }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const set = (next: Partial<State>) => { state = { ...state, ...next }; emit() }

export const isPlaying = (s: State = state) => s.playing && s.settings.enabled.length > 0
export const currentRecord = () => recordById(state.settings.record)

// ---- 재생기: 채널마다 <audio> 하나. 음악은 곡이 끝나면 다음 곡(마지막 다음은 처음).
const players = new Map<Channel, HTMLAudioElement>()
let trackIndex = 0
let trackRecord = ''
const fades = new Map<Channel, number>()

function player(channel: Channel): HTMLAudioElement {
  let a = players.get(channel)
  if (a) return a
  a = new Audio()
  a.preload = 'auto'
  if (channel === musicChannel) {
    a.addEventListener('ended', () => {
      const rec = currentRecord()
      trackIndex = (trackIndex + 1) % rec.tracks.length
      a!.src = rec.tracks[trackIndex]!
      void a!.play().catch(onPlayError)
    })
  } else {
    a.loop = true
    a.src = `/assets/study/sounds/${channel}.m4a`
  }
  a.addEventListener('error', () => { log.error('player error', { channel }); onPlayError(new Error('media error')) })
  players.set(channel, a)
  return a
}

function onPlayError(e: unknown) {
  // 브라우저 자동 재생 막힘(사용자가 아직 누르지 않음)은 실패가 아니라 "멈춤"으로 둔다.
  const blocked = e instanceof DOMException && e.name === 'NotAllowedError'
  if (!blocked) log.error('playback failed', { error: String(e) })
  stopAll(false)
  set({ playing: false, error: blocked ? null : 'playback' })
}

function cancelFade(c: Channel) { const id = fades.get(c); if (id) { cancelAnimationFrame(id); fades.delete(c) } }

/** 0.3초 동안 소리를 줄이고 멈춘다(원본 fadeOut). */
function fadeOutAndPause(c: Channel, a: HTMLAudioElement) {
  cancelFade(c)
  const from = a.volume
  const start = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 300)
    a.volume = from * (1 - t)
    if (t < 1) fades.set(c, requestAnimationFrame(step))
    else { fades.delete(c); a.pause() }
  }
  fades.set(c, requestAnimationFrame(step))
}

function stopAll(fade: boolean) {
  for (const [c, a] of players) fade && !a.paused ? fadeOutAndPause(c, a) : (cancelFade(c), a.pause())
}

/** 설정·재생 상태를 실제 소리에 맞춘다. */
function apply(fade = false) {
  const s = state.settings
  const on = isPlaying() ? new Set(s.enabled) : new Set<Channel>()
  for (const channel of [musicChannel, ...ambientSounds] as Channel[]) {
    if (!on.has(channel)) {
      const a = players.get(channel)
      if (a && !a.paused) fade ? fadeOutAndPause(channel, a) : (cancelFade(channel), a.pause())
      continue
    }
    const a = player(channel)
    cancelFade(channel)
    if (channel === musicChannel) {
      const rec = currentRecord()
      if (trackRecord !== rec.id) { trackRecord = rec.id; trackIndex = 0; a.src = rec.tracks[0]! }
    }
    a.volume = volumeOf(s, channel)
    if (a.paused) void a.play().catch(onPlayError)
  }
}

function update(settings: SoundSettings, playing = state.playing, fade = false) {
  writeSettings(settings)
  set({ settings, playing, error: null })
  apply(fade)
}

// ---- 동작(원본 StudySoundController와 같은 규칙)
/** 공부방에 들어오면 마지막 음반(없으면 카페)과 지난번 켠 환경음을 튼다. 브라우저가 막으면 멈춘 채로 둔다. */
export function playOnEntry() {
  if (isPlaying()) return
  const enabled = state.settings.enabled.includes(musicChannel) ? state.settings.enabled : [...state.settings.enabled, musicChannel]
  update({ ...state.settings, enabled }, true)
}

export function setEnabled(channel: Channel, on: boolean) {
  const enabled = state.settings.enabled.filter((c) => c !== channel)
  if (on) enabled.push(channel)
  let playing = state.playing
  if (on) playing = true
  if (enabled.length === 0) playing = false
  update({ ...state.settings, enabled }, playing)
}

/** 음반을 턴테이블에 얹고 튼다. 이미 얹혀 있으면 내린다. */
export function toggleRecord(record: StudyRecord) {
  const onTurntable = currentRecord().id === record.id && state.settings.enabled.includes(musicChannel)
  if (onTurntable) return setEnabled(musicChannel, false)
  state = { ...state, settings: { ...state.settings, record: record.id } }
  setEnabled(musicChannel, true)
}

/** 환경음 슬라이더: 0이면 끄고, 그 밖의 값은 켠다. 마지막으로 들리던 값은 남긴다. */
export function setAmbientLevel(sound: AmbientSound, level: number) {
  if (!Number.isFinite(level) || level < 0 || level > 1) return
  const on = level > 0
  const wasOn = state.settings.enabled.includes(sound)
  if (on) state = { ...state, settings: { ...state.settings, volumes: { ...state.settings.volumes, [sound]: level } } }
  if (on !== wasOn) return setEnabled(sound, on)
  if (on) update(state.settings)
}

export function setVolume(channel: Channel, volume: number) {
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) return
  update({ ...state.settings, volumes: { ...state.settings.volumes, [channel]: volume } })
}

export function play() {
  if (state.settings.enabled.length === 0) return
  resumeSession = null
  update(state.settings, true)
}

export function pause() {
  resumeSession = null
  update(state.settings, false, true)
}

/** 턴테이블을 누를 때: 재생 중이면 멈추고, 고른 소리가 없으면 음반을 얹는다. */
export function togglePlayback() {
  if (isPlaying()) return pause()
  if (state.settings.enabled.length === 0) return toggleRecord(currentRecord())
  play()
}

// ---- 타이머와 함께 멈추기(원본 StudySoundTimerBinding·timerChanged)
let resumeSession: string | null = null
export function timerChanged(prev: { id: string | null; running: boolean }, next: { id: string | null; running: boolean }) {
  if (!state.settings.stopWithTimer) return
  const finished = prev.id != null && next.id == null
  if (((prev.running && !next.running) || finished) && isPlaying()) {
    resumeSession = next.id === prev.id ? next.id : null
    update(state.settings, false, true)
  } else if (!prev.running && next.running && next.id != null && next.id === resumeSession) {
    resumeSession = null
    update(state.settings, true)
  }
  if (next.id == null || next.id !== prev.id) resumeSession = null
}

/** 공부 탭을 떠나면 모든 소리를 멈춘다(원본은 페이지가 사라질 때 플레이어를 닫는다). */
export function leave() {
  resumeSession = null
  set({ playing: false })
  stopAll(false)
}

export function useSound(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)
}
