/**
 * 중앙 로거. console을 직접 쓰지 않는다(AGENTS.md 로깅). 형식: `[Source] 동작 key: value`.
 * 운영 빌드는 warn 이상만 남긴다. 쿠키·토큰·본문 전체를 넘기지 않는다.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const min: Level = import.meta.env.PROD ? 'warn' : 'debug'

function emit(level: Level, source: string, message: string, fields?: Record<string, unknown>) {
  if (order[level] < order[min]) return
  const tail = fields ? ' ' + Object.entries(fields).map(([k, v]) => `${k}: ${String(v)}`).join(', ') : ''
  const line = `[${source}] ${message}${tail}`
  // eslint-disable-next-line no-console -- 이 파일만 콘솔에 쓴다.
  ;(level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line)
}

export function logger(source: string) {
  return {
    debug: (m: string, f?: Record<string, unknown>) => emit('debug', source, m, f),
    info: (m: string, f?: Record<string, unknown>) => emit('info', source, m, f),
    warn: (m: string, f?: Record<string, unknown>) => emit('warn', source, m, f),
    error: (m: string, f?: Record<string, unknown>) => emit('error', source, m, f),
  }
}
