// 공부를 끝낸 뒤 뜨는 "오늘의 공부" 화면: 스토리 크기 요약 카드 미리보기와 공유·저장 단추.
// 앱에 없는 화면이라 통계 화면(호수 바탕·섬 단추)과 같은 모양을 쓴다(docs/design-parity/exceptions.md).
// 공유는 파일 공유를 지원하는 브라우저(주로 휴대폰)에서만 보이고, 어디서나 이미지 저장은 된다.
import { useEffect, useState } from 'react'
import { IconDownload, IconShare2, IconX } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { IslandBackground } from '../../../core/ui/IslandBackground'
import { IslandButton } from '../../../core/ui/IslandButton'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import { useToast } from '../../../core/ui/Toast'
import { logger } from '../../../core/log/log'
import { drawRecapCard, loadRecapFonts } from './drawRecapCard'
import type { StudyRecap } from './studyRecap'
import s from './recap.module.css'

const log = logger('StudyRecap')

type Image = { url: string; file: File; canShare: boolean }

export function StudyRecapOverlay({ recap, onClose }: { recap: StudyRecap; onClose: () => void }) {
  const toast = useToast()
  const [image, setImage] = useState<Image | null>(null)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    const started = performance.now()
    void (async () => {
      await loadRecapFonts(recap)
      const canvas = document.createElement('canvas')
      drawRecapCard(canvas, recap)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('toBlob returned null')
      if (cancelled) return
      url = URL.createObjectURL(blob)
      const file = new File([blob], `studyvillage-${recap.studyDate}.png`, { type: 'image/png' })
      const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
      setImage({ url, file, canShare })
      log.debug('recap card drawn', { bytes: blob.size, can_share: canShare, elapsed_ms: Math.round(performance.now() - started) })
    })().catch((e: unknown) => log.error('recap card failed', { reason: e instanceof Error ? e.message : String(e) }))
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [recap])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const share = async () => {
    if (!image) return
    try {
      await navigator.share({ files: [image.file] })
      log.info('recap shared')
    } catch (e) {
      // 사용자가 공유 창을 닫은 것은 실패가 아니다.
      if (e instanceof DOMException && e.name === 'AbortError') return
      log.warn('recap share failed', { reason: e instanceof Error ? e.name : String(e) })
      toast(webText.recapShareFailed, { type: 'error' })
    }
  }

  const save = () => {
    if (!image) return
    const a = document.createElement('a')
    a.href = image.url
    a.download = image.file.name
    a.click()
    log.info('recap saved')
    toast(webText.recapSaved)
  }

  return (
    <div className={`palette-day ${s.root}`} role="dialog" aria-modal="true" aria-label={webText.recapTitle}>
      <IslandBackground ground="lake" />
      <header className={s.header}>
        <span className={s.side} />
        <h1 className={s.title}>{webText.recapTitle}</h1>
        <IslandIconButton icon={IconX} label={webText.recapClose} onClick={onClose} />
      </header>
      <div className={s.preview}>
        {image ? <img className={s.card} src={image.url} alt={webText.recapImageAlt} /> : <div className={`${s.card} ${s.cardLoading}`} />}
      </div>
      <div className={s.actions}>
        {image?.canShare && <IslandButton primary expand icon={IconShare2} label={t('studyRoomShareRoom')} onClick={() => void share()} minHeight={52} />}
        <IslandButton expand primary={!image?.canShare} icon={IconDownload} label={webText.recapSave} onClick={image ? save : undefined} minHeight={52} />
      </div>
    </div>
  )
}
