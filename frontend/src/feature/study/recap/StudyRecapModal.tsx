// 공부를 끝낸 뒤 공부방 위에 뜨는 "오늘의 공부 여권" 모달(앱에 없는 화면, 사용자 지정 2026-11-23).
// 위는 여권 아트(가로), 아래는 제목·숫자·오늘의 기록·행동. 넓은 화면은 아래를 두 단으로, 좁은 화면은 한 줄로 쌓는다.
// 접근성: dialog·aria-modal, 열리면 대화상자로 포커스, Tab은 안에서만 돈다, Esc·바깥으로 닫고 닫히면 원래 자리로 돌린다.
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { IconDownload, IconShare2, IconX } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { useToast } from '../../../core/ui/Toast'
import { logger } from '../../../core/log/log'
import { formatStudyDuration } from '../home/studyFormat'
import { drawStory, loadPassportFonts, passport } from './passportDraw'
import { PassportArt } from './PassportArt'
import type { StudyRecap } from './studyRecap'
import s from './recap.module.css'

const log = logger('StudyRecap')

/** 오늘의 기록 목록에 쓰는 과목 줄 수. 나머지는 "그 외 n과목" 한 줄. */
const ledgerRows = 4

type Story = { url: string; file: File; canShare: boolean }

export function StudyRecapModal({ recap, onClose, onOpenStats }: { recap: StudyRecap; onClose: () => void; onOpenStats: () => void }) {
  const toast = useToast()
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [story, setStory] = useState<Story | null>(null)
  const [fit, setFit] = useState(1)

  // 글꼴을 읽은 뒤 여권을 그리고, 저장·공유용 스토리 이미지를 미리 만든다(공유는 누른 순간 파일이 있어야 한다).
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

  // 여권(가로 480pt)을 무대 폭에 맞춘다(넓으면 조금 키우고, 좁으면 줄인다).
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => setFit(Math.min(1.18, (el.clientWidth - 24) / (passport.width + 40))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 포커스: 열리면 대화상자로, Tab은 안에서만, 닫히면 원래 자리로.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')]
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

  const total = formatStudyDuration(recap.todaySeconds)
  const shown = recap.subjects.slice(0, ledgerRows)
  const rest = recap.subjects.slice(ledgerRows)
  const metrics: { label: string; value: string; note?: string }[] = [
    // 이번 세션 몫은 1분 이상일 때만 적는다("이번에 0분"은 정보가 없다).
    { label: webText.recapMetricFocus, value: total, note: recap.sessionSeconds >= 60 ? webText.recapMetricSession(formatStudyDuration(recap.sessionSeconds)) : undefined },
    { label: webText.recapMetricSubjects, value: webText.recapMetricSubjectsValue(recap.subjects.length) },
    { label: webText.recapMetricStreak, value: t('studyStatsStreakValue', { count: recap.streakDays }) },
  ]

  return (
    <div className={s.root}>
      <div className={s.backdrop} onClick={onClose} />
      <div ref={dialog} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <button type="button" className={s.close} onClick={onClose} aria-label={webText.recapClose}><IconX size={18} stroke={2} /></button>

        <div ref={stage} className={s.stage}>
          <div className={s.fit} style={{ '--fit': fit, width: (passport.width + 40) * fit, height: (passport.height + 40) * fit } as CSSProperties}>
            {ready ? <PassportArt recap={recap} label={webText.recapPassportAlt(recap.nickname, total)} /> : <div className={s.artLoading} aria-busy="true" />}
          </div>
        </div>

        <div className={s.body}>
          <section className={s.summary}>
            <p className={s.eyebrow}><span>{recap.serial}</span><span aria-hidden="true">·</span><span>{recap.studyDate.replace(/-/g, '.')}</span></p>
            <h2 id={titleId} className={s.headline}>{webText.recapHeadline}</h2>
            <p className={s.lede}>{webText.recapBody}</p>
            <dl className={s.metrics}>
              {metrics.map((m, i) => (
                <div key={m.label} className={s.metric} style={{ '--i': i } as CSSProperties}>
                  <dt>{m.label}</dt>
                  <dd>{m.value}</dd>
                  {m.note && <dd className={s.metricNote}>{m.note}</dd>}
                </div>
              ))}
            </dl>
          </section>

          <section className={s.side}>
            <h3 className={s.ledgerTitle}>{webText.recapLedgerTitle}</h3>
            <ol className={s.ledger}>
              {shown.map((r, i) => (
                <li key={`${r.subject ?? ''}-${i}`} style={{ '--i': i } as CSSProperties}>
                  <span className={s.ledgerIndex}>{String(i + 1).padStart(2, '0')}</span>
                  <span className={r.subject == null ? `${s.ledgerName} ${s.ledgerNone}` : s.ledgerName}>{r.subject ?? t('studySubjectNone')}</span>
                  <span className={s.ledgerLeader} aria-hidden="true" />
                  <span className={s.ledgerTime}>{formatStudyDuration(r.seconds)}</span>
                </li>
              ))}
              {rest.length > 0 && (
                <li style={{ '--i': shown.length } as CSSProperties}>
                  <span className={s.ledgerIndex}>··</span>
                  <span className={`${s.ledgerName} ${s.ledgerNone}`}>{webText.recapLedgerMore(rest.length)}</span>
                  <span className={s.ledgerLeader} aria-hidden="true" />
                  <span className={s.ledgerTime}>{formatStudyDuration(rest.reduce((sum, r) => sum + r.seconds, 0))}</span>
                </li>
              )}
            </ol>

            <div className={s.actions}>
              <div className={s.primaryRow}>
                <button type="button" className={s.primary} onClick={save} disabled={!story}>
                  <IconDownload size={18} stroke={2} />
                  <span>{story ? webText.recapSave : webText.recapSaving}</span>
                </button>
                {story?.canShare && (
                  <button type="button" className={s.iconAction} onClick={() => void share()} aria-label={webText.recapShare} title={webText.recapShare}>
                    <IconShare2 size={18} stroke={2} />
                  </button>
                )}
              </div>
              <div className={s.secondaryRow}>
                <button type="button" className={s.secondary} onClick={onOpenStats}>{webText.recapOpenStats}</button>
                <button type="button" className={s.tertiary} onClick={onClose}>{webText.recapClose}</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
