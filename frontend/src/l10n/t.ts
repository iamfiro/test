// 문구는 PocketTime ARB(lib/l10n/features/study_ko.arb·todo_ko.arb, f574f242)의 한국어를 그대로 쓴다.
import study from './study_ko.json'
import todo from './todo_ko.json'

const messages: Record<string, unknown> = { ...study, ...todo }

export type MessageKey = keyof typeof study | keyof typeof todo

/** ICU 자리표시자 `{name}`와 `{n, plural, =0{..} other{..}}`·`select`만 다룬다(ARB에 쓰인 범위). */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const raw = messages[key]
  if (typeof raw !== 'string') throw new Error(`missing message: ${String(key)}`)
  return format(raw, params)
}

function format(src: string, params: Record<string, string | number>): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch !== '{') { out += ch; i++; continue }
    const end = matchBrace(src, i)
    const body = src.slice(i + 1, end)
    out += formatArg(body, params)
    i = end + 1
  }
  return out
}

function matchBrace(src: string, start: number): number {
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) return i }
  }
  throw new Error(`unbalanced message: ${src}`)
}

function formatArg(body: string, params: Record<string, string | number>): string {
  const parts = body.split(',')
  const name = parts[0]!.trim()
  if (parts.length === 1) {
    if (!(name in params)) throw new Error(`missing param ${name}`)
    return String(params[name])
  }
  const kind = parts[1]!.trim()
  const rest = body.slice(body.indexOf(',', body.indexOf(',') + 1) + 1)
  const value = params[name]
  if (value === undefined) throw new Error(`missing param ${name}`)
  const options = parseOptions(rest)
  let chosen: string | undefined
  if (kind === 'plural') {
    chosen = options[`=${value}`] ?? options.other
    return format(chosen ?? '', params).replaceAll('#', String(value))
  }
  if (kind === 'select') chosen = options[String(value)] ?? options.other
  return format(chosen ?? '', params)
}

function parseOptions(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  let i = 0
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i]!)) i++
    const keyStart = i
    while (i < src.length && src[i] !== '{' && !/\s/.test(src[i]!)) i++
    const key = src.slice(keyStart, i)
    while (i < src.length && src[i] !== '{') i++
    if (i >= src.length) break
    const end = matchBrace(src, i)
    out[key] = src.slice(i + 1, end)
    i = end + 1
  }
  return out
}
