// 신고·차단 문구. 신고 시트는 앱 ARB(lib/l10n/features/social_ko.arb reportSheet*, f574f242)와 앱
// report_reason.dart의 사유 이름을 그대로 쓴다. 사칭은 계약(openapi.yaml ReportReason) 문구("사칭해요")를 쓴다(웹에는
// 학교·선생님 맥락이 없다). 차단·메시지 메뉴는 앱에 없어 앱 ARB 말투로 새로 썼다(launch.md F5).
import type { components } from '../core/api/schema'

type ReportReason = components['schemas']['ReportReason']

export const moderationText = {
  // 앱 reportSheet*
  reportTitle: '무엇이 문제인가요?',
  reportReasonLabel: '신고 이유',
  reportDetailLabel: '어떤 문제인가요',
  reportDetailHint: '무엇이 문제인지 알려주세요',
  reportGoodFaith: '심각한 문제라고 판단해요',
  reportWarning: '확인하는 동안 이 제보는 숨겨질 수 있어요. 장난으로 반복해서 신고하면 신고 기능을 쓸 수 없게 될 수 있어요.',
  reportSubmit: '신고하기',
  reportSubmitting: '보내는 중…',
  reportSuccess: '신고를 접수했어요.',
  reportFailed: '신고를 접수하지 못했어요. 잠시 후 다시 시도해주세요.',
  reasons: {
    personal_info: '개인정보가 담겼어요',
    defamation: '누군가를 비방해요',
    profanity: '욕설이 있어요',
    sexual: '성적인 내용이에요',
    impersonation: '사칭해요',
    spam: '장난이거나 도배예요',
    other: '그 밖의 문제예요',
  } satisfies Record<ReportReason, string>,
  // 웹에서 새로 쓴 것
  reportAlsoBlock: '이 사람의 채팅을 앞으로 보지 않기',
  reportMessageSummary: (nickname: string, body: string) => `${nickname}님의 메시지 "${body}"`,
  reportGone: '이미 사라진 메시지예요.',
  messageMenu: (nickname: string) => `${nickname}님의 메시지`,
  messageReport: '메시지 신고하기',
  block: '채팅 차단하기',
  unblock: '채팅 차단 풀기',
  blockTitle: (nickname: string) => `${nickname}님을 차단할까요?`,
  blockDescription: '이 사람의 채팅이 나에게 보이지 않아요. 상대는 차단된 것을 알 수 없고, 공부방에서는 그대로 보여요.',
  blockConfirm: '차단하기',
  blocked: (nickname: string) => `${nickname}님의 채팅을 차단했어요.`,
  unblocked: (nickname: string) => `${nickname}님의 채팅 차단을 풀었어요.`,
  blockFailed: '차단하지 못했어요. 잠시 후 다시 시도해주세요.',
  unblockFailed: '차단을 풀지 못했어요. 잠시 후 다시 시도해주세요.',
  blockLimit: '더 차단할 수 없어요. 차단한 사람을 먼저 풀어 주세요.',
  blockList: '차단한 사람',
  blockListCount: (count: number) => `차단한 사람 ${count}명`,
  blockListEmpty: '차단한 사람이 없어요',
  cancel: '취소',
} as const
