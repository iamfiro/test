// 공부를 끝낸 뒤 흐린 공부방 위에 뜨는 "오늘의 공부" 카드(앱에 없는 화면, 사용자 결정 2026-11-23).
// 카드 한 장과 그 아래 섬 단추(이미지 저장 · 공유(지원 시) · 닫기)만 둔다. 저장 이미지는 같은 카드를 호수 위에 놓은 스토리.
// 접근성: dialog·aria-modal, 열리면 대화상자로 포커스, Tab은 안에서만 돈다, Esc·바깥으로 닫고 닫히면 원래 자리로 돌린다.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { IconDownload, IconShare2, IconX } from '@tabler/icons-react'
import { webText } from '../../../l10n/web_ko'
import { useToast } from '../../../core/ui/Toast'
import { IslandButton } from '../../../core/ui/IslandButton'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import { logger } from '../../../core/log/log'
import { formatStudyDuration } from '../home/studyFormat'
import { cardLayout, drawStory, loadCardAssets, type CardAssets } from './cardDraw'
import { CardArt, stageSize } from './CardArt'
import type { StudyRecap } from './studyRecap'
import s from './recap.module.css'

const log = logger('StudyRecap')

/** 넓은 화면에서 키우는 상한. */
const maxFit = 1.2

type Story = { url: string; file: File; canShare: boolean }

export function StudyRecapModal({ recap, onClose }: { recap: StudyRecap; onClose: () => void }) {
  const toast = useToast()
  const dialog = useRef<HTMLDivElement>(null)
  const [assets, setAssets] = useState<CardAssets | null>(null)
  const [story, setStory] = useState<Story | null>(null)
  const [fit, setFit] = useState(1)

  // 글꼴을 읽은 뒤 여권을 그리고, 저장·공유용 이미지를 미리 만든다(공유는 누른 순간 파일이 있어야 한다).
  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    const started = performance.now()
    void (async () => {
      const loaded = await loadCardAssets(recap)
      if (cancelled) return
      setAssets(loaded)
      const canvas = document.createElement('canvas')
      drawStory(canvas, recap, loaded)
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

  // 카드를 창에 맞춘다: 좌우 16 여백, 아래로는 단추 자리(약 110)를 남긴다.
  const box = stageSize(cardLayout(recap))
  useEffect(() => {
    const measure = () => setFit(Math.min(maxFit, (window.innerWidth - 32) / box.width, (window.innerHeight - 110) / box.height))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [box.width, box.height])

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

  const label = webText.recapCardAlt(recap.nickname, formatStudyDuration(recap.todaySeconds))
  return (
    <div className={`palette-day ${s.root}`}>
      <div className={s.backdrop} onClick={onClose} />
      <div ref={dialog} className={s.floating} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className={s.fit} style={{ '--fit': fit, width: box.width * fit, height: box.height * fit } as CSSProperties}>
          {assets ? <CardArt recap={recap} assets={assets} label={label} /> : <div className={s.artLoading} aria-busy="true" />}
        </div>
        <div className={s.actions}>
          <IslandButton primary icon={IconDownload} label={story ? webText.recapSave : webText.recapSaving} onClick={story ? save : undefined} minHeight={50} />
          {story?.canShare && <IslandIconButton icon={IconShare2} label={webText.recapShare} onClick={() => void share()} size={50} iconSize={20} />}
          <IslandIconButton icon={IconX} label={webText.recapClose} onClick={onClose} size={50} iconSize={20} />
        </div>
      </div>
    </div>
  )
}
