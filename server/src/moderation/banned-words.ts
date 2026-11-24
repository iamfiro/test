import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** 저장소의 금칙어 목록. `src/`와 빌드된 `dist/` 모두 `server/data/`를 같은 상대 경로로 본다. */
const LIST_PATH = fileURLToPath(new URL('../../data/banned_words.txt', import.meta.url));

/**
 * 비교용 정규화: NFKC(전각·호환 문자 통일) → 소문자 → 글자·숫자가 아닌 것(공백·기호·밑줄) 모두 제거.
 * 사이에 공백·기호를 끼워 피하는 것("씨 발", "f.u.c.k")을 막는다.
 */
export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function loadList(path: string): string[] {
  const words = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map(normalizeForMatch)
    .filter((word) => word.length > 0);
  if (words.length === 0) throw new Error(`금칙어 목록이 비어 있다: ${path}`);
  return [...new Set(words)];
}

// 서버 시작 때 한 번 읽는다. 파일이 없거나 비면 시작을 거부한다(검사 없이 도는 것을 막는다).
const WORDS = loadList(LIST_PATH);

/** 닉네임·채팅·방 이름 공통 검사. 정규화한 입력 안에 정규화한 금칙어가 들어 있으면 true. */
export function containsBannedWord(text: string): boolean {
  const normalized = normalizeForMatch(text);
  if (normalized.length === 0) return false;
  return WORDS.some((word) => normalized.includes(word));
}
