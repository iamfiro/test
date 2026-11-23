// 내 공부 태그 고르기(앱에 없는 화면). 과목 고르기 시트(PaperSheet·턱 있는 알약 칩·둥근 입력칸) 모양을 따른다.
// 저장은 서버 성공 뒤에만 반영하고, 실패하면 고른 칩을 그대로 두고 알린다.
import { useMemo, useRef, useState } from 'react'
import { IconCheck, IconPlus, IconX } from '@tabler/icons-react'
import { newIdempotencyKey } from '../../../core/api/client'
import { IslandButton } from '../../../core/ui/IslandButton'
import { IslandSurface } from '../../../core/ui/IslandSurface'
import { PaperSheet } from '../../../core/ui/PaperSheet'
import { useToast } from '../../../core/ui/Toast'
import { tagText } from '../../../l10n/web_tags_ko'
import { webText } from '../../../l10n/web_ko'
import { myTagCountMax, saveMyTags, suggestTag, useTagSearch, type Tag } from './tagsStore'
import s from './tags.module.css'

function TagChip(props: { tag: Tag; selected: boolean; onClick: () => void }) {
  return (
    <span className={s.chipSlot}>
      <IslandSurface stadium ledge={5} color="var(--i-muted)" ledgeColor="var(--i-paper-ledge)" onClick={props.onClick} className={s.chipSurface} pressed={props.selected} label={props.tag.name}>
        <span className={s.chip}>
          <span className={`${s.chipDot} ${props.selected ? s.chipDotOn : s.chipDotPlain}`}>
            {props.selected ? <IconCheck size={16} stroke={3} /> : <IconPlus size={16} stroke={2.6} />}
          </span>
          <span className={s.chipName}>{props.tag.name}</span>
        </span>
      </IslandSurface>
    </span>
  )
}

export function MyTagsSheet(props: { initial: Tag[]; onDismiss: () => void }) {
  const toast = useToast()
  const [picked, setPicked] = useState<Tag[]>(props.initial)
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  // 같은 선택을 다시 저장할 때(응답 유실)는 같은 키를 쓴다. 선택이 바뀌면 새 키.
  const saveKey = useRef<{ ids: string; key: string } | null>(null)
  const suggestKey = useRef<{ name: string; key: string } | null>(null)
  const { tags, failed } = useTagSearch(q)
  const pickedIds = useMemo(() => new Set(picked.map((t) => t.id)), [picked])
  const changed = picked.map((t) => t.id).join() !== props.initial.map((t) => t.id).join()

  const toggle = (tag: Tag) => {
    if (pickedIds.has(tag.id)) { setPicked(picked.filter((t) => t.id !== tag.id)); return }
    if (picked.length >= myTagCountMax) { toast(tagText.tagLimit, { type: 'error' }); return }
    setPicked([...picked, tag])
  }

  const save = async () => {
    const ids = picked.map((t) => t.id)
    const sig = ids.join()
    if (saveKey.current?.ids !== sig) saveKey.current = { ids: sig, key: newIdempotencyKey() }
    setSaving(true)
    try {
      await saveMyTags(ids, saveKey.current.key)
      props.onDismiss()
    } catch {
      toast(tagText.tagsSaveFailed, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const suggest = async () => {
    const name = q.trim()
    if (suggestKey.current?.name !== name) suggestKey.current = { name, key: newIdempotencyKey() }
    try {
      await suggestTag(name, suggestKey.current.key)
      toast(tagText.tagSuggested, { type: 'success' })
      setQ('')
    } catch {
      toast(tagText.tagSuggestFailed, { type: 'error' })
    }
  }

  const query = q.trim()
  const groups: [string, Tag[]][] = query
    ? [['', tags ?? []]]
    : [[tagText.tagKindExam, (tags ?? []).filter((t) => t.kind === 'exam')], [tagText.tagKindKind, (tags ?? []).filter((t) => t.kind === 'kind')]]

  return (
    <PaperSheet label={tagText.myTagsTitle} onDismiss={props.onDismiss}>
      <div className={s.sheet}>
        <h2 className={s.title}>{tagText.myTagsTitle}</h2>
        <p className={s.description}>{tagText.myTagsDescription}</p>
        {picked.length > 0 && (
          <div className={s.picked}>
            {picked.map((tag) => (
              <button key={tag.id} type="button" className={s.pickedTag} onClick={() => toggle(tag)} aria-label={tagText.tagRemove(tag.name)}>
                #{tag.name}<IconX size={14} stroke={2.6} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <input
          className={s.input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tagText.tagSearchPlaceholder}
          aria-label={tagText.tagSearchPlaceholder}
          maxLength={20}
        />
        <div className={s.results} aria-busy={!tags || undefined}>
          {failed && !tags ? (
            <p className={s.empty}>{webText.loadFailed}</p>
          ) : query && tags && tags.length === 0 ? (
            <div className={s.empty}>
              <p>{tagText.tagSearchEmpty(query)}</p>
              <IslandButton outlined icon={IconPlus} label={tagText.tagSuggest} minHeight={36} onClick={suggest} />
            </div>
          ) : (
            groups.map(([label, list]) => list.length > 0 && (
              <section key={label || 'all'}>
                {label && <h3 className={s.groupLabel}>{label}</h3>}
                <div className={s.chips}>
                  {list.map((tag) => <TagChip key={tag.id} tag={tag} selected={pickedIds.has(tag.id)} onClick={() => toggle(tag)} />)}
                </div>
              </section>
            ))
          )}
        </div>
        <div className={s.action}>
          <IslandButton primary expand label={tagText.tagsSave} onClick={changed && !saving ? save : undefined} />
        </div>
      </div>
    </PaperSheet>
  )
}
