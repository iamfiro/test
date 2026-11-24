import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error 빌드 스크립트(.mjs)라 타입 선언이 없다.
import { securityHeaders } from './scripts/security-headers.mjs'

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // 목 어댑터는 개발 서버에서만 쓴다. 운영 빌드에 섞이면 빌드를 멈춘다.
  if (command === 'build' && env.VITE_DATA_SOURCE === 'mock') {
    throw new Error('VITE_DATA_SOURCE=mock cannot be used for a build')
  }
  return {
    plugins: [react()],
    server: { port: 5190, strictPort: true },
    // 글꼴은 작은 부분 글꼴(unicode-range)도 CSS에 base64로 넣지 않는다: 넣으면 공부 화면 CSS가 360KB가 되고
    // 쓰지 않는 글자 범위까지 처음에 받는다(launch.md F7 첫 로드 크기 측정).
    // 소스맵은 운영 배포에 공개하지 않는다(출시 보안 점검). 오류 추적(Sentry, M9)을 붙이면 'hidden'으로 만들어 업로드만 한다.
    build: { target: 'es2022', sourcemap: false, assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined) },
    // `vite preview`는 배포(dist/_headers)와 같은 보안 헤더로 띄워 CSP 위반을 로컬에서 본다.
    preview: isPreview ? { headers: securityHeaders(env) } : undefined,
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
