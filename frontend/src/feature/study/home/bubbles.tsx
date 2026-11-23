import type { ReactNode } from 'react'
import { PopSwitcher } from './PopSwitcher'
import s from './bubbles.module.css'

/** 크림 종이 말풍선 + 오른쪽 가운데 꼬리(원본 `_PeekTailPainter`, 버튼 쪽을 가리킨다). */
function PaperBubble(props: { children: ReactNode; className?: string }) {
  return (
    <span className={s.bubbleWrap}>
      <span className={s.tail} aria-hidden />
      <span className={`${s.bubble} ${props.className ?? ''}`}>{props.children}</span>
    </span>
  )
}

/**
 * 원본: `_CameraHint`. 시점 버튼 왼쪽에 잠깐 뜨는 새 시점 이름.
 * 들어올 때 240ms easeOutBack, 나갈 때 180ms easeIn.
 */
export function CameraHint(props: { label: string | null }) {
  const label = props.label
  return (
    <div className={s.slot} role="status" aria-live="polite">
      <PopSwitcher itemKey={label} inMs={240} outMs={180}>
        {label != null && (
          <PaperBubble className={s.hint}>
            <span className={s.hintText}>{label}</span>
          </PaperBubble>
        )}
      </PopSwitcher>
    </div>
  )
}

export type ChatPeekMessage = { id: string; nickname: string | null; body: string }

/**
 * 원본: `_ChatPeek`. 채팅 버튼 왼쪽에 잠깐 뜨는 새 말(이름 · 말 한 줄). 오른쪽에서 커지며
 * 미끄러져 나타나고(320ms easeOutBack, 오른쪽 0.25에서) 작아지며 사라진다(220ms easeIn).
 * 누르면 채팅을 연다.
 */
export function ChatPeek(props: { message: ChatPeekMessage | null; onOpen?: () => void }) {
  const message = props.message
  const name = message?.nickname ?? ''
  return (
    <div className={s.slot} aria-live="polite">
      <PopSwitcher itemKey={message?.id ?? null} inMs={320} outMs={220} slideFrom={0.25}>
        {message != null && (
          <button
            type="button"
            className={s.peekButton}
            aria-label={name === '' ? message.body : `${name}, ${message.body}`}
            onClick={props.onOpen}
          >
            <PaperBubble className={s.peek}>
              {name !== '' && <span className={s.peekName}>{name}</span>}
              <span className={s.peekBody}>{message.body}</span>
            </PaperBubble>
          </button>
        )}
      </PopSwitcher>
    </div>
  )
}
