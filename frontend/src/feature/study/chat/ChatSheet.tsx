import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconMessageCircle, IconSend } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { PaperSheet } from '../../../core/ui/PaperSheet'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import { useToast } from '../../../core/ui/Toast'
import { chatBodyMax, type ChatMessage } from './chatProtocol'
import { chatStore, useChat, type ChatState } from './chatStore'
import { launchText } from '../../../l10n/web_launch_ko'
import type { ChatErrorCode } from './chatProtocol'
import s from './ChatSheet.module.css'

const timeFormat = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' })

function statusText(status: ChatState['status']): string {
  switch (status) {
    case 'open': return t('studyChatCaption')
    case 'offline':
    case 'closed': return t('studyChatOffline')
    case 'idle':
    case 'connecting': return t('studyChatConnecting')
  }
}

/** 남의 말풍선 옆 동그라미 색: 사운드 패널 파스텔 중 하나를 작성자 id로 고정해 고른다. */
const avatarColors = ['#E6E0F2', '#BFDDF0', '#E8C39E', '#FFD9BC', '#F7E7B0', '#CDE8C8', '#F7B49A']
function avatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return avatarColors[h % avatarColors.length]!
}

/**
 * 채팅 시트. 사운드 패널과 같은 햇살 노랑 틀 안에 메시지 목록(머리 없음, 연결 중·끊김만 목록 위 알약으로, 같은 사람이
 * 이어 쓰면 이름·동그라미를 한 번만), 아래 종이 우물 입력칸과 주황 보내기 단추. 메시지는 텍스트로만 그린다.
 * 2026-11-23 사용자 요청으로 앱 캡처의 밋밋한 시트에서 다듬었다(docs/design-parity/exceptions.md).
 */
export function ChatSheet(props: { myId: string; onDismiss: () => void }) {
  const chat = useChat()
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    chatStore.setSheetOpen(true)
    return () => chatStore.setSheetOpen(false)
  }, [])

  // 보내기 결과: 서버가 받은 뒤에만 입력칸을 비우고, 실패면 그대로 두고 알린다.
  const outcome = chat.outcome
  useEffect(() => {
    if (!outcome) return
    if (outcome.kind === 'sent') { setDraft(''); stick.current = true }
    else toast(chatFailureText(outcome.code), { type: 'error' })
    chatStore.clearOutcome()
  }, [outcome, toast])

  // 아래에 붙어 있을 때만 새 말로 따라 내려간다(위를 읽는 중이면 그대로).
  useLayoutEffect(() => {
    const el = list.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [chat.messages])

  const sending = chat.pending != null
  const canSend = chat.status === 'open' && !sending && draft.trim().length > 0
  const submit = () => { if (canSend) chatStore.send(draft) }

  return (
    <PaperSheet label={t('studyChatTitle')} onDismiss={props.onDismiss} height="min(560px, calc(100dvh - 120px))" tone="sun" className={s.sheet}>
      <div
        ref={list}
        className={s.list}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {chat.status !== 'open' && (
          <p className={`${s.notice} ${chat.status === 'offline' || chat.status === 'closed' ? s.noticeOffline : ''}`} role="status" aria-live="polite">
            {chat.status !== 'offline' && chat.status !== 'closed' && <i className={s.dot} />}
            {statusText(chat.status)}
          </p>
        )}
        {chat.messages.length === 0 ? (
          <div className={s.empty}>
            <span className={s.emptyIcon}><IconMessageCircle size={30} stroke={2} /></span>
            <p>{t('studyChatEmpty')}</p>
          </div>
        ) : (
          <ol className={s.messages} aria-label={t('studyChatTitle')}>
            {chat.messages.map((m, i) => (
              <MessageRow
                key={m.id}
                message={m}
                mine={m.author.id === props.myId}
                first={chat.messages[i - 1]?.author.id !== m.author.id}
                last={chat.messages[i + 1]?.author.id !== m.author.id}
              />
            ))}
          </ol>
        )}
      </div>
      <form className={s.composer} onSubmit={(e) => { e.preventDefault(); submit() }}>
        <input
          className={s.input}
          value={draft}
          placeholder={t('studyChatHint')}
          aria-label={t('studyChatHint')}
          maxLength={chatBodyMax}
          readOnly={sending}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
        />
        <IslandIconButton
          size={46}
          iconSize={20}
          icon={IconSend}
          label={t('studyChatSend')}
          emphasis="var(--c-accent)"
          // 앱 캡처: 입력칸이 비어 있어도 주황 단추 그대로다(비활성 모양 없음). 보낼 수 없으면 아무 일도 없다.
          onClick={submit}
        />
      </form>
    </PaperSheet>
  )
}

function MessageRow(props: { message: ChatMessage; mine: boolean; first: boolean; last: boolean }) {
  const { message, mine, first, last } = props
  const time = timeFormat.format(new Date(message.sent_at))
  const cls = [s.row, mine ? s.mine : '', first ? s.first : '', last ? s.last : ''].join(' ')
  return (
    <li className={cls}>
      {!mine && (
        <span className={s.avatar} style={{ background: first ? avatarColor(message.author.id) : 'transparent' }} aria-hidden="true">
          {first ? Array.from(message.author.nickname)[0] : ''}
        </span>
      )}
      <span className={s.stack}>
        {!mine && first && <span className={s.name}>{message.author.nickname}</span>}
        <span className={s.line}>
          <span className={s.bubble}>{message.body}</span>
          {last && <time className={s.time} dateTime={message.sent_at}>{time}</time>}
        </span>
      </span>
    </li>
  )
}

/** 보내기 실패 문구(계약 study-room-chat.md 0.2.0 오류 코드). */
function chatFailureText(code: ChatErrorCode | 'INVALID_LOCAL' | 'TOO_MANY_CONNECTIONS'): string {
  switch (code) {
    case 'RATE_LIMITED': return t('studyChatRateLimited')
    case 'FORBIDDEN': return t('studyActionFailed')
    case 'CHAT_DISABLED': return launchText.chatDisabled
    case 'RESTRICTED': return launchText.chatRestricted
    case 'LINK_NOT_ALLOWED': return launchText.chatLink
    case 'BANNED_WORD': return launchText.chatBannedWord
    case 'REPEATED': return launchText.chatRepeated
    case 'TOO_MANY_CONNECTIONS': return launchText.chatTooManyTabs
    case 'INVALID':
    case 'INVALID_LOCAL': return t('studyChatInvalid')
  }
}
