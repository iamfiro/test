// 배포 보안 헤더(launch.md F7·출시 전 확인). CSP의 API·미디어 origin은 빌드 값(VITE_API_ORIGIN·VITE_MEDIA_ORIGIN)에서 오므로
// 빌드 뒤 dist/_headers에 이 스크립트가 써 넣는다(Netlify가 읽는다). `vite preview`도 같은 헤더를 쓴다(vite.config.ts).
//
//   node scripts/security-headers.mjs [mode]   → dist/_headers의 전 경로(/*) 칸을 만들어 붙인다.
//
// 규칙: 스크립트는 'self'만(인라인·eval 없음). 스타일은 'self'만(React는 style을 CSSOM으로 넣어 CSP에 걸리지 않는다).
// three.js GLTFLoader는 GLB 안 텍스처를 blob: URL로 읽고(img·connect), 공부 카드 저장 이미지는 blob:·data:를 쓴다.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

/** origin 하나를 CSP 소스로. 없거나 형식이 틀리면 빌드를 멈춘다(추측으로 채우지 않는다). */
function originOf(name, value) {
  if (!value) throw new Error(`${name} is not set`)
  const url = new URL(value)
  if (url.origin !== value.replace(/\/$/, '')) throw new Error(`${name} must be an origin (no path): ${value}`)
  return url
}

/** 헤더 이름 → 값. env는 VITE_* 값 모음. */
export function securityHeaders(env) {
  const api = originOf('VITE_API_ORIGIN', env.VITE_API_ORIGIN)
  const socket = `${api.protocol === 'https:' ? 'wss:' : 'ws:'}//${api.host}`
  // 방 배너·로고(서버 MEDIA_PUBLIC_BASE_URL)와 음원(M14)을 주는 곳. 없으면 같은 origin만(지금 음원은 번들 제공).
  const media = env.VITE_MEDIA_ORIGIN ? originOf('VITE_MEDIA_ORIGIN', env.VITE_MEDIA_ORIGIN).origin : null
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: blob:${media ? ` ${media}` : ''}`,
    `media-src 'self' blob:${media ? ` ${media}` : ''}`,
    "font-src 'self'",
    `connect-src 'self' blob: ${api.origin} ${socket}${media ? ` ${media}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(api.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
  return {
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // 카메라·마이크·위치 등은 끈다. 전체 화면·화면 켜 두기는 이 사이트만(web-share는 Chromium이 아직 모르는 이름이라 경고가 나서 뺐다, 기본값이 self).
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self), screen-wake-lock=(self)',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cross-Origin-Opener-Policy': 'same-origin',
  }
}

/** Netlify _headers 형식의 전 경로 칸. */
export function headersBlock(env) {
  const lines = Object.entries(securityHeaders(env)).map(([k, v]) => `  ${k}: ${v}`)
  return `\n# 보안 헤더(빌드 때 scripts/security-headers.mjs가 VITE_API_ORIGIN·VITE_MEDIA_ORIGIN으로 만든다).\n/*\n${lines.join('\n')}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'production'
  const root = fileURLToPath(new URL('..', import.meta.url))
  // loadEnv는 .env.<mode> 위에 셸 환경 변수(VITE_*)를 얹는다(배포 환경 변수가 이긴다).
  const env = loadEnv(mode, root, 'VITE_')
  const file = fileURLToPath(new URL('../dist/_headers', import.meta.url))
  const base = readFileSync(file, 'utf8')
  if (base.includes('Content-Security-Policy')) throw new Error('dist/_headers already has security headers (run after a fresh vite build)')
  writeFileSync(file, base.trimEnd() + '\n' + headersBlock(env))
  process.stdout.write(`security headers written: dist/_headers api: ${env.VITE_API_ORIGIN}\n`)
}
