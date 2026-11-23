import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IconSend } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { PaperSheet } from '../../../core/ui/PaperSheet'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import { useToast } from '../../../core/ui/Toast'
import { chatBodyMax, type ChatMessage } from './chatProtocol'
import { chatStore, useChat, type ChatState } from './chatStore'
import s from './ChatSheet.module.css'

const timeFormat = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' })

function statusText(status: ChatState['status']): string {
  switch (status) {
    case 'open': return t('studyChatCaption')
    case 'offline': return t('studyChatOffline')
    case 'idle':
    case 'connecting': return t('studyChatConnecting')
  }
}

/**
 * 채팅 시트(앱 캡처). 크림 종이 시트 위 가운데 연결 안내, 가운데 메시지 목록(비면 안내 한 줄),
 * 아래 알약 입력칸과 주황 보내기 단추. 메시지는 텍스트로만 그린다.
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
    else toast(outcome.code === 'RATE_LIMITED' ? t('studyChatRateLimited') : outcome.code === 'FORBIDDEN' ? t('studyActionFailed') : t('studyChatInvalid'), { type: 'error' })
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
    <PaperSheet label={t('studyChatTitle')} onDismiss={props.onDismiss} height="min(461px, calc(100dvh - 120px))">
      <p className={`${s.status} ${chat.status === 'offline' ? s.statusOffline : ''}`} role="status" aria-live="polite">
        {statusText(chat.status)}
      </p>
      <div
        ref={list}
        className={s.list}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {chat.messages.length === 0 ? (
          <p className={s.empty}>{t('studyChatEmpty')}</p>
        ) : (
          <ol className={s.messages} aria-label={t('studyChatTitle')}>
            {chat.messages.map((m, i) => (
              <MessageRow key={m.id} message={m} mine={m.author.id === props.myId} showName={chat.messages[i - 1]?.author.id !== m.author.id} />
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
          size={48}
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

function MessageRow(props: { message: ChatMessage; mine: boolean; showName: boolean }) {
  const { message, mine } = props
  const time = timeFormat.format(new Date(message.sent_at))
  return (
    <li className={`${s.row} ${mine ? s.mine : ''}`}>
      {!mine && props.showName && <span className={s.name}>{message.author.nickname}</span>}
      <span className={s.line}>
        <span className={s.bubble}>{message.body}</span>
        <time className={s.time} dateTime={message.sent_at}>{time}</time>
      </span>
    </li>
  )
}
