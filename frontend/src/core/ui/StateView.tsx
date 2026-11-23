import { webText } from '../../l10n/web_ko'
import { IslandButton } from './IslandButton'
import s from './StateView.module.css'

/** 원본: AppStateView. 상태 그림은 앱 assets/icons/empty_*.svg를 쓴다. */
export function StateView(props: { illustration: string; title: string; description?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={s.view} role="status">
      <img src={`/assets/icons/${props.illustration}.svg`} width={96} height={96} alt="" />
      <p className={s.title}>{props.title}</p>
      {props.description && <p className={s.description}>{props.description}</p>}
      {props.action && <IslandButton label={props.action.label} onClick={props.action.onClick} />}
    </div>
  )
}

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return <StateView illustration="empty_hidden" title={webText.loadFailed} action={{ label: webText.retry, onClick: onRetry }} />
}
