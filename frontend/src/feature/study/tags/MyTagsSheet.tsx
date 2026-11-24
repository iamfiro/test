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

function DarkChip(props: { tag: Tag; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`${s.darkChip} ${props.selected ? s.darkChipOn : ''}`} aria-pressed={props.selected} aria-label={props.tag.name} onClick={props.onClick}>
      {props.selected ? <IconCheck size={15} stroke={3} aria-hidden /> : <IconPlus size={15} stroke={2.6} aria-hidden />}
      {props.tag.name}
    </button>
  )
}

/**
 * 태그 고르기 본문(고른 태그 줄·검색칸·카탈로그 칩·없는 태그 제안). 내 태그 시트와 온보딩 "목표 고르기"가 같이 쓴다.
 * 고른 목록은 부모가 들고 있다.
 */
export function TagPicker(props: {
  picked: Tag[]
  onChange: (picked: Tag[]) => void
  resultsClassName?: string
  /** dark: 검은 그라데이션 위 흰 글자·단순한 알약(온보딩). 기본은 크림 종이 시트. */
  tone?: 'paper' | 'dark'
}) {
  const dark = props.tone === 'dark'
  const toast = useToast()
  const { picked } = props
  const [q, setQ] = useState('')
  const suggestKey = useRef<{ name: string; key: string } | null>(null)
  const { tags, failed } = useTagSearch(q)
  const pickedIds = useMemo(() => new Set(picked.map((t) => t.id)), [picked])

  const toggle = (tag: Tag) => {
    if (pickedIds.has(tag.id)) { props.onChange(picked.filter((t) => t.id !== tag.id)); return }
    if (picked.length >= myTagCountMax) { toast(tagText.tagLimit, { type: 'error' }); return }
    props.onChange([...picked, tag])
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
    <>
      {picked.length > 0 && (
        <div className={`${s.picked} ${dark ? s.dark : ''}`}>
          {picked.map((tag) => (
            <button key={tag.id} type="button" className={s.pickedTag} onClick={() => toggle(tag)} aria-label={tagText.tagRemove(tag.name)}>
              #{tag.name}<IconX size={14} stroke={2.6} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <input
        className={`${s.input} ${dark ? s.inputDark : ''}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tagText.tagSearchPlaceholder}
        aria-label={tagText.tagSearchPlaceholder}
        maxLength={20}
      />
      <div className={`${s.results} ${dark ? s.dark : ''} ${props.resultsClassName ?? ''}`} aria-busy={!tags || undefined}>
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
                {list.map((tag) => dark
                  ? <DarkChip key={tag.id} tag={tag} selected={pickedIds.has(tag.id)} onClick={() => toggle(tag)} />
                  : <TagChip key={tag.id} tag={tag} selected={pickedIds.has(tag.id)} onClick={() => toggle(tag)} />)}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  )
}

/** 내 태그 시트. 저장이 성공하면 onSaved(서버가 저장한 태그) 뒤 닫는다. */
export function MyTagsSheet(props: { initial: Tag[]; onDismiss: () => void; onSaved?: (tags: Tag[]) => void }) {
  const toast = useToast()
  const [picked, setPicked] = useState<Tag[]>(props.initial)
  const [saving, setSaving] = useState(false)
  // 같은 선택을 다시 저장할 때(응답 유실)는 같은 키를 쓴다. 선택이 바뀌면 새 키.
  const saveKey = useRef<{ ids: string; key: string } | null>(null)
  const changed = picked.map((t) => t.id).join() !== props.initial.map((t) => t.id).join()

  const save = async () => {
    const ids = picked.map((t) => t.id)
    const sig = ids.join()
    if (saveKey.current?.ids !== sig) saveKey.current = { ids: sig, key: newIdempotencyKey() }
    setSaving(true)
    try {
      const saved = await saveMyTags(ids, saveKey.current.key)
      props.onSaved?.(saved)
      props.onDismiss()
    } catch {
      toast(tagText.tagsSaveFailed, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <PaperSheet label={tagText.myTagsTitle} onDismiss={props.onDismiss}>
      <div className={s.sheet}>
        <h2 className={s.title}>{tagText.myTagsTitle}</h2>
        <p className={s.description}>{tagText.myTagsDescription}</p>
        <TagPicker picked={picked} onChange={setPicked} />
        <div className={s.action}>
          <IslandButton primary expand label={tagText.tagsSave} onClick={changed && !saving ? save : undefined} />
        </div>
      </div>
    </PaperSheet>
  )
}
