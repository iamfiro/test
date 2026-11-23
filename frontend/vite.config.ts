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
    build: { target: 'es2022', sourcemap: true },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
