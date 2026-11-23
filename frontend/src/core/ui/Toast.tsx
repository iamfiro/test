import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { IconAlertCircleFilled, IconCircleCheckFilled } from '@tabler/icons-react'
import s from './Toast.module.css'

/** 원본: AppSnackBar/AppToast. 아래 120px에 뜨는 알약 토스트, 3초(행동 버튼 있으면 5초). */
type ToastType = 'normal' | 'error' | 'success'
type ToastData = { id: number; message: string; type: ToastType; actionLabel?: string; onAction?: () => void }
type Show = (message: string, opts?: { type?: ToastType; actionLabel?: string; onAction?: () => void }) => void

const ToastContext = createContext<Show | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const seq = useRef(0)
  const show = useCallback<Show>((message, opts) => {
    window.clearTimeout(timer.current)
    const id = ++seq.current
    setToast({ id, message, type: opts?.type ?? 'normal', actionLabel: opts?.actionLabel, onAction: opts?.onAction })
    timer.current = window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), opts?.actionLabel ? 5000 : 3000)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={s.region} role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={s.toast}>
            {toast.type === 'error' && <IconAlertCircleFilled size={20} color="#FF3B30" />}
            {toast.type === 'success' && <IconCircleCheckFilled size={20} color="#34C759" />}
            <span className={s.message}>{toast.message}</span>
            {toast.actionLabel && (
              <button type="button" className={s.action} onClick={() => { toast.onAction?.(); setToast(null) }}>{toast.actionLabel}</button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): Show {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast outside ToastProvider')
  return ctx
}
