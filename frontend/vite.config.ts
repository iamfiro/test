import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode, command }) => {
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
    build: { target: 'es2022', sourcemap: true, assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined) },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
