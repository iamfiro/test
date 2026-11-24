import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import type { ReactNode } from 'react'
import { SessionProvider, useSession } from '../feature/auth/session'
import { LoginPage } from '../feature/auth/LoginPage'
import { ToastProvider } from '../core/ui/Toast'
import { StudyHomePage } from '../feature/study/shell/StudyHomePage'
import { LoadFailed } from '../core/ui/StateView'
import { SubjectManageRoute } from '../feature/study/subject/SubjectManageRoute'

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireSession><StudyHomePage tab="study" /></RequireSession>} />
            <Route path="/rooms" element={<RequireSession><StudyHomePage tab="rooms" /></RequireSession>} />
            <Route path="/schedule" element={<RequireSession><StudyHomePage tab="schedule" /></RequireSession>} />
            <Route path="/stats" element={<RequireSession><StudyHomePage tab="stats" /></RequireSession>} />
            <Route path="/subjects" element={<RequireSession><SubjectManageRoute /></RequireSession>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

function RequireSession({ children }: { children: ReactNode }) {
  const { state, refresh } = useSession()
  const location = useLocation()
  if (state.status === 'loading') return null
  if (state.status === 'error') return <LoadFailed onRetry={refresh} />
  if (state.status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  // 첫 가입 온보딩을 끝내기 전에는 공부 탭(온보딩이 거기서 열린다)으로만 간다.
  if (state.me.onboarding_completed_at == null && location.pathname !== '/') return <Navigate to="/" replace />
  return <>{children}</>
}
