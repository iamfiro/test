import { useState } from 'react'
import { IconAdjustmentsHorizontal, IconCheck, IconPlus } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { PaperSheet } from '../../../core/ui/PaperSheet'
import { IslandButton } from '../../../core/ui/IslandButton'
import { IslandSurface } from '../../../core/ui/IslandSurface'
import { formatStudyDuration } from '../home/studyFormat'
import type { StudySettings } from '../timer/settingsStore'
import { studySubjectColors, subjectColorOf } from '../timer/subjectPalette'
import { initialColorOf, subjectCountMax, subjectNameMax, subjectNameProblem, type SubjectNameProblem } from './subjectEdits'
import s from './subject.module.css'

/** 과목 칩: 턱이 있는 알약. 고른 과목은 초록 체크 동그라미, 아니면 과목 색 동그라미. */
function SubjectChip(props: { name: string; seconds: number | null; color: string | null; selected: boolean; onClick: () => void; leading?: 'plus' }) {
  return (
    <span className={s.chipSlot}>
      <IslandSurface stadium ledge={5} color="var(--i-muted)" ledgeColor="var(--i-paper-ledge)" onClick={props.onClick} className={s.chipSurface} pressed={props.leading ? undefined : props.selected}>
        <span className={s.chip}>
          {props.leading === 'plus' ? (
            <span className={`${s.chipDot} ${s.chipDotPlain}`}><IconPlus size={16} stroke={2.6} /></span>
          ) : props.selected ? (
            <span className={`${s.chipDot} ${s.chipDotOn}`}><IconCheck size={16} stroke={3} /></span>
          ) : (
            <span className={s.chipDot} style={{ background: props.color ?? 'color-mix(in srgb, var(--i-ink-soft) 35%, transparent)' }} />
          )}
          <span className={s.chipText}>
            <span className={s.chipName}>{props.name}</span>
            {props.seconds != null && <span className={s.chipTime}>{formatStudyDuration(props.seconds)}</span>}
          </span>
        </span>
      </IslandSurface>
    </span>
  )
}

/**
 * 과목 고르기 시트(앱 캡처). 제목 "과목", 오른쪽 "과목 관리" 테두리 단추, 아래 가운데 정렬 칩.
 * 칩 설명은 오늘 그 과목으로 공부한 시간(서버 통계 `today_by_subject`).
 */
export function SubjectPickerSheet(props: {
  settings: StudySettings
  todayOf: (subject: string | null) => number
  busy: boolean
  onSelect: (subject: string | null) => void
  onAdd: () => void
  onManage: () => void
  onDismiss: () => void
}) {
  const { settings } = props
  const canAdd = settings.subjects.length < subjectCountMax
  return (
    <PaperSheet label={t('studySubjectSheetTitle')} onDismiss={props.onDismiss}>
      <div className={s.pickerHeader}>
        <h2 className={s.pickerTitle}>{t('studySubjectSheetTitle')}</h2>
        <IslandButton outlined icon={IconAdjustmentsHorizontal} label={t('studySubjectManage')} minHeight={36} onClick={props.onManage} />
      </div>
      <div className={s.chips} aria-busy={props.busy || undefined}>
        <SubjectChip
          name={t('studySubjectNone')}
          seconds={props.todayOf(null)}
          color={null}
          selected={settings.subject == null}
          onClick={() => props.onSelect(null)}
        />
        {settings.subjects.map((name) => (
          <SubjectChip
            key={name}
            name={name}
            seconds={props.todayOf(name)}
            color={subjectColorOf(settings, name).fill}
            selected={settings.subject === name}
            onClick={() => props.onSelect(name)}
          />
        ))}
        {canAdd && <SubjectChip leading="plus" name={t('studySubjectAdd')} seconds={null} color={null} selected={false} onClick={props.onAdd} />}
      </div>
    </PaperSheet>
  )
}

const problemText: Record<SubjectNameProblem, string | null> = {
  empty: null, // 버튼이 꺼지는 것으로 충분하다.
  tooLong: null, // 입력칸이 20자에서 멈춘다.
  taken: t('studySubjectNameTaken'),
}

/** 새 과목·과목 수정 시트: 이름 입력칸, 색 8개, 확인 단추. 저장은 부르는 쪽이 서버 응답 뒤에 닫는다. */
export function SubjectEditSheet(props: {
  settings: StudySettings
  /** null이면 새 과목. */
  editing: string | null
  busy: boolean
  onSubmit: (name: string, color: number | null) => void
  onDismiss: () => void
}) {
  const { settings, editing } = props
  const [name, setName] = useState(editing ?? '')
  // 새 과목은 고르기 전까지 색을 저장하지 않는다(원본 규칙: 이름 코드 합). 미리보기는 그 색.
  const [color, setColor] = useState<number | null>(editing == null ? null : initialColorOf(settings, editing))
  const problem = subjectNameProblem(settings, name, editing)
  const shownColor = color ?? (name.trim() === '' ? null : initialColorOf(settings, name.trim()))
  const title = editing == null ? t('studySubjectNew') : t('studySubjectEdit')
  const submit = problem == null && !props.busy ? () => props.onSubmit(name, color) : undefined
  const message = problem == null ? null : problemText[problem]
  return (
    <PaperSheet label={title} onDismiss={props.onDismiss}>
      <form
        className={s.edit}
        onSubmit={(e) => { e.preventDefault(); submit?.() }}
      >
        <h2 className={s.editTitle}>{title}</h2>
        <label className={s.field}>
          <span className="sr-only">{t('studySubjectFieldLabel')}</span>
          <input
            className={s.input}
            value={name}
            maxLength={subjectNameMax}
            placeholder={t('studySubjectFieldLabel')}
            autoFocus
            enterKeyHint="done"
            aria-invalid={message != null || undefined}
            aria-describedby={message != null ? 'subject-name-problem' : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p id="subject-name-problem" className={s.problem} role={message ? 'alert' : undefined}>{message ?? ''}</p>
        <p className={s.colorLabel}>{t('studySubjectColor')}</p>
        <div className={s.colors} role="radiogroup" aria-label={t('studySubjectColor')}>
          {studySubjectColors.map((c, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={shownColor === i}
              aria-label={t('studySubjectColorOption', { number: i + 1 })}
              className={`${s.colorDot} ${shownColor === i ? s.colorDotOn : ''}`}
              style={{ background: c.fill, color: c.ink }}
              onClick={() => setColor(i)}
            >
              {shownColor === i && <IconCheck size={18} stroke={3} />}
            </button>
          ))}
        </div>
        <div className={s.editAction}>
          <IslandButton
            primary
            expand
            label={editing == null ? t('studySubjectAdd') : t('studySubjectRenameAction')}
            onClick={submit}
          />
        </div>
      </form>
    </PaperSheet>
  )
}
