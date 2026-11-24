// 출시 데모(docs/plan/launch.md F1·F6·F7·F9)에서 새로 생긴 웹 문구. 앱 ARB에서 가져온 것은 출처를 적는다.
// 서버 오류 문구는 서버(server/src/http/errors.ts·routes)의 사용자 문구와 같은 뜻으로 맞췄다(코드별로 프론트가 정한다).
export const launchText = {
  brand: 'StudyVillage',
  // 랜딩(study-landing.md D11 초안, 사용자 확정 전).
  landingTagline: '친구들과 함께 공부하는 3D 공부방',
  // PocketTime lib/l10n/features/study_ko.arb studyOnboardingStart
  start: '시작하기',
  consentLead: '계속하면 ',
  consentTerms: '이용약관',
  consentJoin: '·',
  consentPrivacy: '개인정보처리방침',
  consentTail: '에 동의합니다',
  storageNote: '이 브라우저에 기록이 저장돼요',
  // POST /auth/start 거절(서버 errors.accountCreate*·accountRateLimited)
  startDisabled: '지금은 새로 시작할 수 없어요. 잠시 뒤 다시 시도해 주세요',
  startRestricted: '이 네트워크에서는 새로 시작할 수 없어요',
  startRateLimited: '이 네트워크에서 새로 시작한 사람이 너무 많아요. 잠시 뒤 다시 시도해 주세요',
  startFailed: '시작하지 못했어요. 잠시 후 다시 시도해주세요.',
  // PocketTime lib/l10n/features/common_ko.arb commonApiErrorNetwork
  network: '네트워크에 연결할 수 없어요.',
  // 내 데이터 지우기(결정 2d, 데모에서는 탈퇴와 같다)
  deleteData: '내 데이터 지우기',
  deleteDataTitle: '내 데이터를 지울까요?',
  deleteDataDescription: '공부 기록·공부방·채팅이 바로 모두 지워지고 되돌릴 수 없어요. 다음에 들어오면 새 사람으로 시작해요.',
  deleteDataConfirm: '지우기',
  deleteDataFailed: '지우지 못했어요. 잠시 후 다시 시도해주세요.',
  // 초대(로그인 대신 시작하기)
  inviteStartHelp: '시작하면 캐릭터를 고른 뒤 바로 참여할 수 있어요',
  // 상태 화면(앱 AppStateView 문구: commonError·commonRetry·commonLoadFailed)
  errorTitle: '오류가 발생했어요',
  retry: '다시 시도',
  offlineTitle: '네트워크에 연결할 수 없어요.',
  offlineDescription: '연결되면 다시 시도해 주세요',
  notFoundTitle: '찾을 수 없는 페이지예요',
  notFoundDescription: '주소가 바뀌었거나 없어진 페이지예요',
  goHome: '처음으로',
  // 방 만들기 거절(서버 errors.roomCreate*) · 금칙어(422 VALIDATION_ERROR, details.field)
  roomCreateDisabled: '지금은 공부방을 만들 수 없어요. 잠시 뒤 다시 시도해 주세요',
  roomCreateRestricted: '공부방을 만들 수 없는 상태예요',
  roomCreateRateLimited: '오늘 이 네트워크에서 만든 공부방이 너무 많아요',
  roomNameBlocked: '이 이름은 쓸 수 없어요. 다른 이름을 골라 주세요',
  roomDescriptionBlocked: '이 소개는 쓸 수 없어요',
  nicknameBlocked: '이 닉네임은 쓸 수 없어요. 다른 이름을 골라 주세요',
  // 채팅 오류(docs/contracts/study-room-chat.md 0.2.0)
  chatDisabled: '지금은 채팅을 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요',
  chatRestricted: '채팅을 쓸 수 없는 상태예요',
  chatLink: '링크는 보낼 수 없어요',
  chatBannedWord: '보낼 수 없는 말이 들어 있어요',
  chatRepeated: '같은 말을 연달아 보낼 수 없어요',
  chatTooManyTabs: '다른 탭에서 열린 공부방이 너무 많아요. 다른 탭을 닫아 주세요',
  // 인앱 브라우저 안내(실제 문제가 확인될 때만 켠다, launch.md F9)
  inAppTitle: '브라우저로 열어 주세요',
  inAppDescription: '이 앱 안의 브라우저에서는 일부 기능이 동작하지 않을 수 있어요. 오른쪽 위 메뉴에서 다른 브라우저로 열어 주세요.',
  // 약관·방침(초안)
  legalDraft: '초안 — 출시 전 검토 필요',
  legalBack: '뒤로',
} as const
