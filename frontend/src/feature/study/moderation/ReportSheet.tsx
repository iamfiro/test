// 원본: lib/feature/moderation/widgets/report_sheet.dart (f574f242). 떠 있는 시트에 무엇을 신고하는지 한 줄,
// 신고 이유, (그 밖의 문제면) 설명, "심각한 문제라고 판단해요" 확인, (작성자가 있으면) 차단 함께, 경고 문구, 신고하기.
// 웹: 이유 고르기는 앱의 드롭다운(시트를 하나 더 여는 칸) 대신 시트 안 라디오 목록이다(시트 위 시트를 피함,
// docs/design-parity/exceptions.md). 서버가 받은 뒤에만 닫고 알린다. 실패하면 입력을 그대로 두고 알린다.
import { useRef, useState } from 'react'
import { IconFlag, IconSquare, IconSquareCheckFilled } from '@tabler/icons-react'
import { AppBottomSheet } from '../../../core/ui/AppBottomSheet'
import { AppButton } from '../../../core/ui/AppButton'
import { newIdempotencyKey } from '../../../core/api/client'
import { useToast } from '../../../core/ui/Toast'
import { moderationText } from '../../../l10n/web_moderation_ko'
import { blockUser, fileReport, ModerationError, reportReasons, type ReportCreate, type ReportReason } from './moderationStore'
import s from './moderation.module.css'

const detailMax = 1000

export type ReportTarget = {
  type: ReportCreate['target_type']
  id: string
  /** 무엇을 신고하는지 한 줄(앱 ReportTarget.summary). */
  summary: string
  /** 작성자(차단을 함께 제안). 모르면 null. */
  authorId: string | null
}

export function ReportSheet(props: { target: ReportTarget; onDone: () => void; onDismiss: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [detail, setDetail] = useState('')
  const [goodFaith, setGoodFaith] = useState(false)
  const [alsoBlock, setAlsoBlock] = useState(false)
  const [busy, setBusy] = useState(false)
  // 같은 내용을 다시 보낼 때(응답 유실) 같은 키. 내용이 바뀌면 새 키.
  const key = useRef<{ sig: string; key: string } | null>(null)
  const blockKey = useRef(newIdempotencyKey())

  const trimmed = detail.trim()
  const valid = reason != null && goodFaith && trimmed.length <= detailMax && (reason !== 'other' || trimmed.length > 0)

  const submit = async () => {
    if (!valid || busy || reason == null) return
    const body: ReportCreate = { target_type: props.target.type, target_id: props.target.id, reason, detail: trimmed.length > 0 ? trimmed : null }
    const sig = JSON.stringify(body)
    if (key.current?.sig !== sig) key.current = { sig, key: newIdempotencyKey() }
    setBusy(true)
    try {
      await fileReport(body, key.current.key)
      key.current = null
      if (alsoBlock && props.target.authorId) {
        // 신고는 접수됐다. 차단이 실패하면 그것만 알린다.
        try { await blockUser(props.target.authorId, blockKey.current) } catch { toast(moderationText.blockFailed, { type: 'error' }) }
      }
      toast(moderationText.reportSuccess)
      props.onDone()
    } catch (e) {
      const code = e instanceof ModerationError ? e.api.code : undefined
      toast(code === 'RESOURCE_NOT_FOUND' ? moderationText.reportGone : moderationText.reportFailed, { type: 'error' })
      if (code === 'RESOURCE_NOT_FOUND') props.onDismiss()
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppBottomSheet title={moderationText.reportTitle} onDismiss={() => { if (!busy) props.onDismiss() }} contentPadding="8px 24px 0">
      <div className={s.form}>
        <p className={s.summary}><IconFlag size={16} aria-hidden="true" /><span>{props.target.summary}</span></p>
        <fieldset className={s.reasons}>
          <legend className={s.label}>{moderationText.reportReasonLabel}</legend>
          {reportReasons.map((r) => (
            <label key={r} className={reason === r ? `${s.reason} ${s.reasonOn}` : s.reason}>
              <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              <span>{moderationText.reasons[r]}</span>
            </label>
          ))}
        </fieldset>
        {reason === 'other' && (
          <label className={s.detail}>
            <span className={s.label}>{moderationText.reportDetailLabel}</span>
            <textarea
              rows={3}
              maxLength={detailMax}
              placeholder={moderationText.reportDetailHint}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </label>
        )}
        <Check label={moderationText.reportGoodFaith} checked={goodFaith} onChange={setGoodFaith} />
        {props.target.authorId != null && <Check label={moderationText.reportAlsoBlock} checked={alsoBlock} onChange={setAlsoBlock} />}
        <p className={s.warning}>{moderationText.reportWarning}</p>
        <AppButton expand loading={busy} onClick={valid ? () => void submit() : undefined}>
          {busy ? moderationText.reportSubmitting : moderationText.reportSubmit}
        </AppButton>
      </div>
    </AppBottomSheet>
  )
}

/** 앱 _CheckRow: 네모 체크 아이콘 + 글. */
function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const Icon = props.checked ? IconSquareCheckFilled : IconSquare
  return (
    <label className={props.checked ? `${s.check} ${s.checkOn}` : s.check}>
      <input type="checkbox" className="sr-only" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <Icon size={20} aria-hidden="true" />
      <span>{props.label}</span>
    </label>
  )
}
