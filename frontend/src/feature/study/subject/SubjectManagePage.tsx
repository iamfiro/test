import { IconChevronLeft, IconMinus, IconPlus } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import { IslandButton } from '../../../core/ui/IslandButton'
import { IslandSurface } from '../../../core/ui/IslandSurface'
import { LoadFailed } from '../../../core/ui/StateView'
import { subjectColorOf } from '../timer/subjectPalette'
import { subjectCountMax } from './subjectEdits'
import { useSubjectEditor } from './useSubjectEditor'
import s from './subject.module.css'

/**
 * 과목 관리 화면(과목 고르기 시트의 "과목 관리"). 크림 종이 바탕, "과목 n개" 아래 카드 한 장에 줄마다
 * 색·이름·"지금 과목" 표찰·빼기 단추. 줄을 누르면 과목 수정 시트, 아래 "새 과목" 단추.
 */
export function SubjectManagePage(props: { onBack: () => void }) {
  const editor = useSubjectEditor()
  const { settings } = editor
  return (
    <div className={`${s.page} palette-day`}>
      <header className={s.pageHeader}>
        <IslandIconButton icon={IconChevronLeft} label="뒤로" onClick={props.onBack} />
        <h1 className={s.pageTitle}>{t('studySubjectManage')}</h1>
        <span className={s.pageSide} />
      </header>
      <main className={s.pageBody}>
        {editor.loadFailed && settings == null && <LoadFailed onRetry={editor.reload} />}
        {settings != null && (
          <>
            <p className={s.sectionLabel}>{t('studySubjectCount', { count: settings.subjects.length })}</p>
            <IslandSurface>
              {settings.subjects.length === 0 ? (
                <p className={s.empty}>{t('studySubjectEmpty')}</p>
              ) : (
                <ul className={s.rows}>
                  {settings.subjects.map((name) => (
                    <li key={name} className={s.row}>
                      <button
                        type="button"
                        className={s.rowMain}
                        aria-label={t('studySubjectRenameLabel', { name })}
                        onClick={() => editor.openEdit(name)}
                      >
                        <span className={s.rowDot} style={{ background: subjectColorOf(settings, name).fill, borderColor: subjectColorOf(settings, name).ink }} />
                        <span className={s.rowName}>{name}</span>
                        {settings.subject === name && <span className={s.inUse}>{t('studySubjectInUse')}</span>}
                      </button>
                      <IslandIconButton
                        size={36}
                        iconSize={16}
                        icon={IconMinus}
                        label={t('studySubjectRemoveLabel', { name })}
                        onClick={editor.busy ? undefined : () => editor.remove(name)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </IslandSurface>
            {settings.subjects.length < subjectCountMax && (
              <div className={s.addRow}>
                <IslandButton expand icon={IconPlus} label={t('studySubjectNew')} onClick={editor.openNew} />
              </div>
            )}
          </>
        )}
      </main>
      {editor.sheets}
    </div>
  )
}
