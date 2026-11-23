// 과목 고르기·만들기·수정·지우기. 모든 쓰기는 설정 전체 PUT이고, 화면은 서버 응답 뒤에만 바뀐다.
// 실패하면 시트를 닫지 않고 입력값을 그대로 둔 채 알린다.
import { useEffect, useState, type ReactNode } from 'react'
import { t } from '../../../l10n/t'
import { useToast } from '../../../core/ui/Toast'
import { logger } from '../../../core/log/log'
import { currentSettings, loadSettings, saveSettings, useStudySettings, type StudySettings } from '../timer/settingsStore'
import { useTimer } from '../timer/timerStore'
import { useStats } from '../timer/statsStore'
import { addSubject, editSubject, removeSubject, selectSubject } from './subjectEdits'
import { SubjectEditSheet, SubjectPickerSheet } from './SubjectSheets'

const log = logger('StudySubjects')

type Sheet = { kind: 'none' } | { kind: 'pick' } | { kind: 'edit'; editing: string | null; from: 'pick' | 'page' }

export function useSubjectEditor(opts: { onManage?: () => void } = {}) {
  const settings = useStudySettings()
  const timer = useTimer()
  const stats = useStats()
  const toast = useToast()
  const [sheet, setSheet] = useState<Sheet>({ kind: 'none' })
  const [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const reload = () => {
    setLoadFailed(false)
    void loadSettings().then((ok) => setLoadFailed(!ok))
  }
  // 캐시 우선: 메모리에 있으면 그대로 보이고, 없을 때만 읽는다.
  useEffect(() => { if (settings == null) reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 진행 중 세션의 과목은 이름을 바꾸거나 지우지 않는다(잰 시간이 다른 이름으로 남지 않게).
  const lockedSubject = timer.session?.subject ?? null

  async function write(next: StudySettings, action: string): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    try {
      await saveSettings(next)
      return true
    } catch (e) {
      log.warn('save failed', { action, code: (e as { api?: { code: string } }).api?.code ?? 'unknown' })
      toast(t('studyActionFailed'), { type: 'error' })
      return false
    } finally {
      setBusy(false)
    }
  }

  const todayOf = (subject: string | null) => stats?.today_by_subject.find((x) => x.subject === subject)?.seconds ?? 0

  const openPicker = () => setSheet({ kind: 'pick' })
  const openNew = () => setSheet({ kind: 'edit', editing: null, from: 'page' })
  const openEdit = (name: string) => {
    if (name === lockedSubject) { toast(t('studySubjectLocked')); return }
    setSheet({ kind: 'edit', editing: name, from: 'page' })
  }

  const remove = async (name: string) => {
    if (!settings) return
    if (name === lockedSubject) { toast(t('studySubjectLocked')); return }
    const before = settings
    if (!(await write(removeSubject(before, name), 'remove'))) return
    toast(t('studySubjectRemoved', { name }), {
      actionLabel: t('todoUndo'),
      // 되돌리기도 서버 쓰기다. 그사이 다른 변경이 있었을 수 있으니 지금 설정에 그 과목만 다시 넣는다.
      onAction: () => void restore(before, name),
    })
  }

  async function restore(before: StudySettings, name: string) {
    // 토스트 콜백에서 불리므로 그 순간의 설정을 읽는다.
    const now = currentSettings()
    if (!now || now.subjects.includes(name)) return
    const index = Math.min(before.subjects.indexOf(name), now.subjects.length)
    const subjects = [...now.subjects]
    subjects.splice(index, 0, name)
    const colors = { ...now.subject_colors }
    if (before.subject_colors[name] !== undefined) colors[name] = before.subject_colors[name]
    await write({ ...now, subjects, subject: before.subject === name && now.subject == null ? name : now.subject, subject_colors: colors }, 'undo')
  }
  let sheets: ReactNode = null
  if (settings && sheet.kind === 'pick') {
    sheets = (
      <SubjectPickerSheet
        settings={settings}
        todayOf={todayOf}
        busy={busy}
        onSelect={async (name) => {
          if (name === settings.subject) { setSheet({ kind: 'none' }); return }
          if (await write(selectSubject(settings, name), 'select')) setSheet({ kind: 'none' })
        }}
        onAdd={() => setSheet({ kind: 'edit', editing: null, from: 'pick' })}
        onManage={() => { setSheet({ kind: 'none' }); opts.onManage?.() }}
        onDismiss={() => setSheet({ kind: 'none' })}
      />
    )
  }
  if (settings && sheet.kind === 'edit') {
    const back = () => setSheet(sheet.from === 'pick' ? { kind: 'pick' } : { kind: 'none' })
    sheets = (
      <SubjectEditSheet
        key={sheet.editing ?? '\u0000new'}
        settings={settings}
        editing={sheet.editing}
        busy={busy}
        onSubmit={async (name, color) => {
          if (sheet.editing == null) {
            // 고르기 시트에서 만들었으면 만든 과목을 바로 고른다(원본 "과목 추가" 행).
            let next = addSubject(settings, name, color)
            if (sheet.from === 'pick') next = selectSubject(next, name.trim())
            if (await write(next, 'add')) setSheet({ kind: 'none' })
          } else {
            const unchanged = name.trim() === sheet.editing && color === settings.subject_colors[sheet.editing]
            if (unchanged || (await write(editSubject(settings, sheet.editing, name, color ?? 0), 'edit'))) back()
          }
        }}
        onDismiss={back}
      />
    )
  }

  return { settings, busy, loadFailed, reload, openPicker, openNew, openEdit, remove, sheets }
}
