// 공부방 태그·추천 문구(앱 ARB에 없는 웹 전용, docs/plan/study-tags.md). web_ko.ts와 같은 규칙이다.
// 따로 둔 이유: 같은 때 다른 작업이 web_ko.ts를 고치고 있어 한 파일에 섞지 않으려고.
export const tagText = {
  roomsRecommended: '나와 같은 공부',
  myTagsTitle: '내 공부 태그',
  myTagsDescription: '준비하는 시험이나 공부를 최대 5개 골라요. 고른 태그는 내 프로필에 보여요.',
  myTagsPrompt: '준비하는 시험이나 공부를 고르면\n같은 공부를 하는 공부방을 추천해 드려요.',
  myTagsPick: '태그 고르기',
  // 고르기 안내 카드의 장식 칩. docs/plan/study-tags.md 2절 시드에 있는 이름만 쓴다(눌리지 않는다).
  myTagsSamples: ['수능', '토익', '공무원 9급', '정보처리기사', '코딩', '독서'],
  myTagsEdit: '태그 수정',
  recommendedEmpty: '아직 같은 태그를 단 공부방이 없어요',
  tagSearchPlaceholder: '시험이나 공부 이름으로 찾기',
  tagKindExam: '시험',
  tagKindKind: '공부 종류',
  tagSearchEmpty: (name: string) => `'${name}' 태그는 아직 없어요`,
  tagSuggest: '이 태그 제안하기',
  tagSuggested: '제안을 보냈어요. 확인한 뒤 추가할게요.',
  tagSuggestFailed: '제안을 보내지 못했어요. 잠시 후 다시 시도해주세요.',
  tagLimit: '태그는 5개까지 고를 수 있어요',
  tagsSave: '저장하기',
  tagsSaveFailed: '태그를 저장하지 못했어요. 잠시 후 다시 시도해주세요.',
  tagRemove: (name: string) => `${name} 빼기`,
} as const
