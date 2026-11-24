// 남의 채팅 메시지를 길게 누르거나(오른쪽 클릭·메뉴 키) 고르면 뜨는 시트: 메시지 신고하기·채팅 차단하기(결정 9, 앱에 없는 메뉴).
// 차단은 한 번 더 묻고, 서버가 받은 뒤에만 그 사람의 말을 지운다.
import { useRef, useState } from 'react'
import { IconFlag, IconBan } from '@tabler/icons-react'
import { AppBottomSheet } from '../../../core/ui/AppBottomSheet'
import { AppButton } from '../../../core/ui/AppButton'
import { newIdempotencyKey } from '../../../core/api/client'
import { useToast } from '../../../core/ui/Toast'
import { moderationText } from '../../../l10n/web_moderation_ko'
import type { ChatMessage } from '../chat/chatProtocol'
import { blockUser, ModerationError } from './moderationStore'
import type { ReportTarget } from './ReportSheet'
import s from './moderation.module.css'

/** 메시지 신고 대상(요약에는 앞 40자만). */
export function messageReportTarget(m: ChatMessage): ReportTarget {
  const chars = Array.from(m.body)
  const body = chars.length > 40 ? `${chars.slice(0, 40).join('')}…` : m.body
  return { type: 'message', id: m.id, summary: moderationText.reportMessageSummary(m.author.nickname, body), authorId: m.author.id }
}

export function MessageMenuSheet(props: { message: ChatMessage; onReport: (target: ReportTarget) => void; onDismiss: () => void }) {
  const { message } = props
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return <BlockConfirmSheet userId={message.author.id} nickname={message.author.nickname} onDone={props.onDismiss} onDismiss={props.onDismiss} />
  }
  return (
    <AppBottomSheet title={moderationText.messageMenu(message.author.nickname)} onDismiss={props.onDismiss}>
      <div className={s.menu}>
        <button type="button" className={s.menuItem} onClick={() => props.onReport(messageReportTarget(message))}>
          <IconFlag size={20} aria-hidden="true" />{moderationText.messageReport}
        </button>
        <button type="button" className={`${s.menuItem} ${s.menuDanger}`} onClick={() => setConfirming(true)}>
          <IconBan size={20} aria-hidden="true" />{moderationText.block}
        </button>
      </div>
    </AppBottomSheet>
  )
}

/** 차단 확인. 서버가 받은 뒤에만 닫고 알린다. */
export function BlockConfirmSheet(props: { userId: string; nickname: string; onDone: () => void; onDismiss: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const key = useRef(newIdempotencyKey())
  const run = async () => {
    if (busy) return
    setBusy(true)
    try {
      await blockUser(props.userId, key.current)
      toast(moderationText.blocked(props.nickname))
      props.onDone()
    } catch (e) {
      const code = e instanceof ModerationError ? e.api.code : undefined
      // 500명을 넘으면 422(계약). 나머지는 다시 시도하게 둔다.
      toast(code === 'VALIDATION_ERROR' ? moderationText.blockLimit : moderationText.blockFailed, { type: 'error' })
      setBusy(false)
    }
  }
  return (
    <AppBottomSheet title={moderationText.blockTitle(props.nickname)} description={moderationText.blockDescription} onDismiss={() => { if (!busy) props.onDismiss() }} contentPadding="16px 24px 0">
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}><AppButton expand background="var(--c-soft-fill)" foreground="var(--c-primary)" onClick={busy ? undefined : props.onDismiss}>{moderationText.cancel}</AppButton></div>
        <div style={{ flex: 1 }}><AppButton expand background="var(--c-error)" loading={busy} onClick={() => void run()}>{moderationText.blockConfirm}</AppButton></div>
      </div>
    </AppBottomSheet>
  )
}
