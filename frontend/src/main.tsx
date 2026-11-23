import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './core/theme/tokens.css'
import './core/theme/base.css'
import { App } from './app/App'

async function start() {
  // 목 어댑터: 개발 서버에서 VITE_DATA_SOURCE=mock일 때만(빌드에서는 vite.config가 거부한다).
  if (import.meta.env.DEV && import.meta.env.VITE_DATA_SOURCE === 'mock') {
    const { startMockWorker } = await import('./mocks/browser')
    await startMockWorker()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
void start()
