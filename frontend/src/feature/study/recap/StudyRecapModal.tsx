// 공부를 끝낸 뒤 공부방 위에 뜨는 "오늘의 공부 여권"(앱에 없는 화면, 사용자 지정 2026-11-23).
// 모달 틀 없이 흐린 공부방 위에 가로 여권만 띄운다. 닫기는 여권 모서리, 저장·공유는 여권 아래 작은 알약 하나.
// 접근성: dialog·aria-modal, 열리면 대화상자로 포커스, Tab은 안에서만 돈다, Esc·바깥으로 닫고 닫히면 원래 자리로 돌린다.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { IconDownload, IconShare2, IconX } from '@tabler/icons-react'
import { webText } from '../../../l10n/web_ko'
import { useToast } from '../../../core/ui/Toast'
import { logger } from '../../../core/log/log'
import { formatStudyDuration } from '../home/studyFormat'
import { drawStory, loadPassportFonts, passport } from './passportDraw'
import { PassportArt } from './PassportArt'
import type { StudyRecap } from './studyRecap'
import s from './recap.module.css'

const log = logger('StudyRecap')

/** 여권 무대(여권 + 뒤 종이 여백) 논리 크기. */
const artW = passport.width + 40
const artH = passport.height + 40
/** 넓은 화면에서 키우는 상한. */
const maxFit = 1.45

type Story = { url: string; file: File; canShare: boolean }

export function StudyRecapModal({ recap, onClose }: { recap: StudyRecap; onClose: () => void }) {
  const toast = useToast()
  const dialog = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [story, setStory] = useState<Story | null>(null)
  const [fit, setFit] = useState(1)

  // 글꼴을 읽은 뒤 여권을 그리고, 저장·공유용 이미지를 미리 만든다(공유는 누른 순간 파일이 있어야 한다).
  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    const started = performance.now()
    void (async () => {
      await loadPassportFonts(recap)
      if (cancelled) return
      setReady(true)
      const canvas = document.createElement('canvas')
      drawStory(canvas, recap)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('toBlob returned null')
      if (cancelled) return
      url = URL.createObjectURL(blob)
      const file = new File([blob], `studyvillage-${recap.studyDate}.png`, { type: 'image/png' })
      const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
      setStory({ url, file, canShare })
      log.debug('recap story ready', { bytes: blob.size, can_share: canShare, elapsed_ms: Math.round(performance.now() - started) })
    })().catch((e: unknown) => log.error('recap story failed', { reason: e instanceof Error ? e.message : String(e) }))
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [recap])

  // 여권을 창에 맞춘다: 좌우 16 여백, 위아래로는 닫기·저장 자리(약 140)를 남긴다.
  useEffect(() => {
    const measure = () => setFit(Math.min(maxFit, (window.innerWidth - 32) / artW, (window.innerHeight - 140) / artH))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // 포커스: 열리면 대화상자로, Tab은 안에서만, 닫히면 원래 자리로.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); before?.focus?.() }
  }, [onClose])

  const save = () => {
    if (!story) return
    const a = document.createElement('a')
    a.href = story.url
    a.download = story.file.name
    a.click()
    log.info('recap saved')
    toast(webText.recapSaved)
  }

  const share = async () => {
    if (!story) return
    try {
      await navigator.share({ files: [story.file] })
      log.info('recap shared')
    } catch (e) {
      // 사용자가 공유 창을 닫은 것은 실패가 아니다.
      if (e instanceof DOMException && e.name === 'AbortError') return
      log.warn('recap share failed', { reason: e instanceof Error ? e.name : String(e) })
      toast(webText.recapShareFailed, { type: 'error' })
    }
  }

  const label = webText.recapPassportAlt(recap.nickname, formatStudyDuration(recap.todaySeconds))
  return (
    <div className={s.root}>
      <div className={s.backdrop} onClick={onClose} />
      <div ref={dialog} className={s.floating} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className={s.fit} style={{ '--fit': fit, width: artW * fit, height: artH * fit } as CSSProperties}>
          {ready ? <PassportArt recap={recap} label={label} /> : <div className={s.artLoading} aria-busy="true" />}
          <button type="button" className={s.close} onClick={onClose} aria-label={webText.recapClose}><IconX size={18} stroke={2} /></button>
        </div>
        <div className={s.actions}>
          <button type="button" className={s.save} onClick={save} disabled={!story}>
            <IconDownload size={17} stroke={2} />
            <span>{story ? webText.recapSave : webText.recapSaving}</span>
          </button>
          {story?.canShare && (
            <button type="button" className={s.share} onClick={() => void share()} aria-label={webText.recapShare} title={webText.recapShare}>
              <IconShare2 size={17} stroke={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
