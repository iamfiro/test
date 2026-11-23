// 앱 ARB에 없는 웹 전용 문구. ui-writing 규칙을 따르고, 앱 auth ARB에서 가져온 문구는 출처를 적는다.
export const webText = {
  // PocketTime lib/l10n/features/auth_ko.arb
  authAppleContinue: '애플 계정으로 계속 진행',
  authGoogleContinue: '구글 계정으로 계속 진행',
  authKakaoLogin: '카카오로 로그인',
  authLoginFailedGeneric: '로그인하지 못했어요. 잠시 후 다시 시도해주세요.',
  // PocketTime lib/l10n/app_ko.arb (공부 시간 표시 formatStudyDuration이 쓰는 공용 문구)
  commonDurationHours: (hours: number) => `${hours}시간`,
  commonDurationHoursMinutes: (hours: number, minutes: number) => `${hours}시간 ${minutes}분`,
  commonDurationMinutes: (minutes: number) => `${minutes}분`,
  // StudyVillage 전용
  loginTitle: '공부방에 들어가려면\n로그인이 필요해요',
  loginDescription: '로그인하면 다른 기기에서도\n공부 기록이 이어져요.',
  devLogin: '개발용 계정으로 로그인',
  account: '계정',
  logout: '로그아웃',
  logoutAll: '모든 기기에서 로그아웃',
  deleteAccount: '탈퇴하기',
  deleteAccountConfirm: '탈퇴하면 공부 기록·도토리·코디가 바로 모두 지워지고 되돌릴 수 없어요.',
  cancel: '취소',
  loadFailed: '불러오지 못했어요. 잠시 후 다시 시도해주세요.',
  retry: '다시 시도',
  roomSearchPlaceholder: '공부방 이름으로 찾기',
  roomSearchEmpty: '찾는 공부방이 없어요',
  roomsAll: '모든 공부방',
} as const
