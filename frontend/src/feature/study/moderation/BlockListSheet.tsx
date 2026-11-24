// 내가 채팅을 차단한 사람 목록과 풀기(GET·DELETE /users/me/blocks). 방을 떠난 사람도 여기서 풀 수 있다.
import { useRef, useState } from 'react'
import { AppBottomSheet } from '../../../core/ui/AppBottomSheet'
import { LoadFailed } from '../../../core/ui/StateView'
import { newIdempotencyKey } from '../../../core/api/client'
import { useToast } from '../../../core/ui/Toast'
import { moderationText } from '../../../l10n/web_moderation_ko'
import { loadBlocks, unblockUser, useBlocks } from './moderationStore'
import s from './moderation.module.css'

export function BlockListSheet(props: { onDismiss: () => void }) {
  const { blocks, failed } = useBlocks()
  return (
    <AppBottomSheet title={moderationText.blockList} onDismiss={props.onDismiss}>
      {blocks == null ? (
        failed ? <LoadFailed onRetry={() => void loadBlocks()} /> : <p className={s.empty} aria-busy="true">…</p>
      ) : blocks.length === 0 ? (
        <p className={s.empty}>{moderationText.blockListEmpty}</p>
      ) : (
        <ul className={s.menu} style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '50dvh', overflowY: 'auto' }}>
          {blocks.map((b) => <BlockRow key={b.user_id} userId={b.user_id} nickname={b.nickname} />)}
        </ul>
      )}
    </AppBottomSheet>
  )
}

function BlockRow(props: { userId: string; nickname: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const key = useRef(newIdempotencyKey())
  const run = async () => {
    setBusy(true)
    try {
      await unblockUser(props.userId, key.current)
      toast(moderationText.unblocked(props.nickname))
    } catch {
      toast(moderationText.unblockFailed, { type: 'error' })
      setBusy(false)
    }
  }
  return (
    <li className={s.blockRow}>
      <span className={s.blockName}>{props.nickname}</span>
      <button type="button" className={s.blockButton} disabled={busy} onClick={() => void run()}>{moderationText.unblock}</button>
    </li>
  )
}
