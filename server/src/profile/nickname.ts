import { randomInt } from 'node:crypto';

const MAX_GRAPHEMES = 12;
const MAX_BYTES = 48;
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });

/**
 * 닉네임 규칙(계약 `Nickname`): 앞뒤 공백을 지운 뒤 1–12자(grapheme), UTF-8 48바이트 이하, 제어 문자 금지.
 * 통과하면 다듬은 값을, 아니면 null.
 */
export function parseNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const nickname = value.trim();
  if (nickname.length === 0) return null;
  if (Buffer.byteLength(nickname, 'utf8') > MAX_BYTES) return null;
  if (/\p{Cc}/u.test(nickname)) return null;
  const length = [...segmenter.segment(nickname)].length;
  return length >= 1 && length <= MAX_GRAPHEMES ? nickname : null;
}

// 관형형 형용사 + 동물. 아이들이 서로 불러도 괜찮도록 부정적이거나 놀림·외모·몸에 관한 말을 넣지 않는다.
// 단어 목록 출처: PocketTimeServer lib/pockettime_server/friends/nickname.ex @ 8cbff23 (docs/sources.md).
export const ADJECTIVES = `
  추운 따뜻한 졸린 배고픈 신난 수줍은 용감한 느긋한 반짝이는 부지런한
  엉뚱한 다정한 씩씩한 명랑한 상냥한 똑똑한 귀여운 행복한 즐거운 포근한
  차분한 꼼꼼한 궁금한 활기찬 노래하는 춤추는 웃는 산책하는 꿈꾸는 수영하는
  독서하는 공부하는 여행하는 요리하는 반가운 든든한 친절한 재빠른 날쌘 슬기로운
  의젓한 늠름한 해맑은 순한 온화한 유쾌한 기운찬 성실한 침착한 너그러운
  산뜻한 상쾌한 시원한 빛나는 조용한 깜찍한 신기한 멋진 근사한 사랑스러운
`.trim().split(/\s+/);

export const ANIMALS = `
  비버 호랑이 수달 펭귄 고슴도치 너구리 판다 다람쥐 해달 알파카
  토끼 고양이 강아지 여우 곰 코알라 기린 코끼리 사자 치타
  얼룩말 돌고래 고래 물개 거북이 부엉이 올빼미 참새 앵무새 오리
  백조 홍학 두루미 까치 독수리 늑대 사슴 순록 라쿤 미어캣
  카피바라 햄스터 친칠라 레서판다 캥거루 청설모 개구리 양 염소 병아리
  펠리컨 북극곰 사막여우 바다사자 해마 꿀벌 나비 무당벌레 달팽이 쿼카
`.trim().split(/\s+/);

export function randomNickname(): string {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${ANIMALS[randomInt(ANIMALS.length)]}`;
}
