import { and, asc, desc, eq, gt, isNull, notInArray, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../db/client.js';
import { chatBlocks, chatMessages, studyRoomMembers, users } from '../db/schema.js';
import { WindowLimiter } from '../http/window-limit.js';
import { containsBannedWord, normalizeForMatch } from '../moderation/banned-words.js';
import { activeIpRestriction, activeUserRestriction } from '../moderation/restrictions.js';
import type { SettingsService } from '../moderation/settings.js';

/** 메시지 길이(결정 9): 앞뒤 공백을 지운 뒤 1–200자. */
export const CHAT_BODY_MAX = 200;
/** `joined`에 싣는 최근 메시지 수. */
export const CHAT_HISTORY = 50;
/** 보관 기간(결정 9). 지난 메시지는 보내지 않고 정리 잡이 지운다. */
export const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** 쓰기 제한(결정 9, launch.md L2b): 사용자당 10초에 5개, IP당 같은 제한. */
export const CHAT_RATE_MAX = 5;
export const CHAT_RATE_WINDOW_MS = 10_000;
/** 같은 사람이 이 시간 안에 같은 글을 다시 쓰면 막는다(연속 같은 글, 도배). */
export const CHAT_REPEAT_WINDOW_MS = 5 * 60 * 1000;

export const LOBBY = 'lobby';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 줄바꿈을 뺀 제어 문자. */
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;
/**
 * 링크: 스킴(`http://`), `www.`, 흔한 최상위 도메인으로 끝나는 주소(`abc.com`, `open.kakao.com/o/...`, `naver.me`).
 * 전각 문자로 피하지 못하게 NFKC로 맞춘 뒤 본다. 숫자 소수(`1.5시간`)는 걸리지 않는다(최상위 도메인이 글자).
 */
const LINK =
  /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\s*\.\s*(?:com|net|org|kr|co|io|me|ly|gg|xyz|app|dev|link|site|shop|info|biz|tv|to|page|so|ai|top|club|live|im|cc|us|jp|cn|ru)(?![a-z]))/i;

export type ChatErrorCode =
  | 'RATE_LIMITED'
  | 'INVALID'
  | 'FORBIDDEN'
  | 'CHAT_DISABLED'
  | 'RESTRICTED'
  | 'LINK_NOT_ALLOWED'
  | 'BANNED_WORD'
  | 'REPEATED';

export class ChatError extends Error {
  constructor(readonly code: ChatErrorCode) {
    super(code);
    this.name = 'ChatError';
  }
}

export interface ChatMessageView {
  id: string;
  client_id: string | null;
  author: { id: string; nickname: string };
  body: string;
  sent_at: string;
}

export type Topic = { kind: 'lobby'; name: string } | { kind: 'room'; name: string; roomId: string };

/** `lobby` 또는 `room:<uuid>`. 아니면 null. 방 id는 소문자로 맞춘다. */
export function parseTopic(value: unknown): Topic | null {
  if (value === LOBBY) return { kind: 'lobby', name: LOBBY };
  if (typeof value !== 'string' || !value.startsWith('room:')) return null;
  const roomId = value.slice('room:'.length);
  if (!UUID.test(roomId)) return null;
  return { kind: 'room', name: `room:${roomId.toLowerCase()}`, roomId: roomId.toLowerCase() };
}

export const hasLink = (text: string) => LINK.test(text.normalize('NFKC'));

/** 그 토픽을 읽고 쓸 수 있는가: 로비는 누구나, 방은 지금 멤버만. */
export async function canAccessTopic(db: DbExecutor, userId: string, topic: Topic): Promise<boolean> {
  if (topic.kind === 'lobby') return true;
  const [row] = await db
    .select({ userId: studyRoomMembers.userId })
    .from(studyRoomMembers)
    .where(and(eq(studyRoomMembers.roomId, topic.roomId), eq(studyRoomMembers.userId, userId)));
  return row !== undefined;
}

const messageColumns = {
  id: chatMessages.id,
  topic: chatMessages.topic,
  clientId: chatMessages.clientId,
  body: chatMessages.body,
  createdAt: chatMessages.createdAt,
  hiddenAt: chatMessages.hiddenAt,
  authorId: chatMessages.authorUserId,
  nickname: users.nickname,
};

type MessageRow = { id: string; topic: string; clientId: string; body: string; createdAt: Date; hiddenAt: Date | null; authorId: string; nickname: string };

export const toMessageView = (row: MessageRow): ChatMessageView => ({
  id: row.id,
  client_id: row.clientId,
  author: { id: row.authorId, nickname: row.nickname },
  body: row.body,
  sent_at: row.createdAt.toISOString(),
});

export interface StoredMessage {
  topic: string;
  hidden: boolean;
  view: ChatMessageView;
}

export class ChatService {
  private readonly userLimit: WindowLimiter;
  private readonly ipLimit: WindowLimiter;

  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
    private readonly settings: SettingsService,
  ) {
    this.userLimit = new WindowLimiter(CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS, now);
    this.ipLimit = new WindowLimiter(CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS, now);
  }

  private retentionCutoff(): Date {
    return new Date(this.now().getTime() - CHAT_RETENTION_MS);
  }

  /** 그 사람이 차단한 사용자 id들. */
  async blockedBy(userId: string): Promise<Set<string>> {
    const rows = await this.db.select({ id: chatBlocks.blockedUserId }).from(chatBlocks).where(eq(chatBlocks.userId, userId));
    return new Set(rows.map((row) => row.id));
  }

  /** 최근 50개(오래된 것부터). 숨긴 것·30일 지난 것·보는 사람이 차단한 사람의 것은 뺀다. */
  async recent(topic: string, blocked: Set<string>): Promise<ChatMessageView[]> {
    const conditions = [eq(chatMessages.topic, topic), isNull(chatMessages.hiddenAt), gt(chatMessages.createdAt, this.retentionCutoff())];
    if (blocked.size > 0) conditions.push(notInArray(chatMessages.authorUserId, [...blocked]));
    const rows = await this.db
      .select(messageColumns)
      .from(chatMessages)
      .innerJoin(users, eq(users.id, chatMessages.authorUserId))
      .where(and(...conditions))
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(CHAT_HISTORY);
    return rows.reverse().map(toMessageView);
  }

  async byId(id: string): Promise<StoredMessage | null> {
    const [row] = await this.db
      .select(messageColumns)
      .from(chatMessages)
      .innerJoin(users, eq(users.id, chatMessages.authorUserId))
      .where(eq(chatMessages.id, id));
    return row ? { topic: row.topic, hidden: row.hiddenAt !== null, view: toMessageView(row) } : null;
  }

  /**
   * 메시지를 저장한다. 같은 사람의 같은 `client_id`가 이미 있으면 새로 저장하지 않고 그 메시지를 돌려준다
   * (`created: false`, 제한·스위치를 다시 보지 않는다). 막히면 `ChatError`. 검사 순서: 멤버 → 형식 → 재전송 →
   * 스위치 → 정지 → 쓰기 제한 → 링크 → 금칙어 → 연속 같은 글.
   */
  async send(input: { userId: string; ip: string; topic: Topic; clientId: unknown; body: unknown }): Promise<{ message: StoredMessage; created: boolean }> {
    const { userId, topic } = input;
    if (!(await canAccessTopic(this.db, userId, topic))) throw new ChatError('FORBIDDEN');
    if (typeof input.clientId !== 'string' || !UUID.test(input.clientId) || typeof input.body !== 'string') throw new ChatError('INVALID');
    const clientId = input.clientId.toLowerCase();
    const body = input.body.trim();
    const length = [...body].length;
    if (length < 1 || length > CHAT_BODY_MAX || CONTROL.test(body)) throw new ChatError('INVALID');

    const existing = await this.byClientId(userId, clientId);
    if (existing) return { message: existing, created: false };

    if (!(await this.settings.isEnabled('chat_write_enabled'))) throw new ChatError('CHAT_DISABLED');
    const now = this.now();
    if (await activeUserRestriction(this.db, userId, 'chat', now)) throw new ChatError('RESTRICTED');
    if (await activeIpRestriction(this.db, input.ip, 'chat', now)) throw new ChatError('RESTRICTED');
    if (!this.userLimit.take(userId).ok || !this.ipLimit.take(input.ip).ok) throw new ChatError('RATE_LIMITED');
    if (hasLink(body)) throw new ChatError('LINK_NOT_ALLOWED');
    if (containsBannedWord(body)) throw new ChatError('BANNED_WORD');
    if (await this.repeats(userId, topic.name, body, now)) throw new ChatError('REPEATED');

    const [inserted] = await this.db
      .insert(chatMessages)
      .values({ topic: topic.name, authorUserId: userId, clientId, body, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: chatMessages.id });
    if (!inserted) {
      // 같은 client_id가 동시에 두 번 왔다(두 탭·재연결 경합): 먼저 저장된 것을 돌려준다.
      return { message: (await this.byClientId(userId, clientId))!, created: false };
    }
    return { message: (await this.byId(inserted.id))!, created: true };
  }

  private async byClientId(userId: string, clientId: string): Promise<StoredMessage | null> {
    const [row] = await this.db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(and(eq(chatMessages.authorUserId, userId), eq(chatMessages.clientId, clientId)));
    return row ? this.byId(row.id) : null;
  }

  /** 같은 토픽에서 내 바로 앞 메시지가 5분 안이고 같은 글이면 true(공백·기호·대소문자 차이는 같은 글로 본다). */
  private async repeats(userId: string, topic: string, body: string, now: Date): Promise<boolean> {
    const [last] = await this.db
      .select({ body: chatMessages.body, createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(and(eq(chatMessages.authorUserId, userId), eq(chatMessages.topic, topic)))
      .orderBy(desc(chatMessages.createdAt))
      .limit(1);
    if (!last || now.getTime() - last.createdAt.getTime() > CHAT_REPEAT_WINDOW_MS) return false;
    const key = (text: string) => normalizeForMatch(text) || text;
    return key(last.body) === key(body);
  }
}

/** 메시지를 숨긴다(신고 기준 도달·운영자). 이미 숨겼으면 false. */
export async function hideMessage(db: DbExecutor, id: string, at: Date): Promise<boolean> {
  const rows = await db
    .update(chatMessages)
    .set({ hiddenAt: at })
    .where(and(eq(chatMessages.id, id), isNull(chatMessages.hiddenAt)))
    .returning({ id: chatMessages.id });
  return rows.length > 0;
}

/** 숨긴 메시지를 되돌린다(운영자). 숨긴 것이 아니면 false. */
export async function restoreMessage(db: DbExecutor, id: string): Promise<boolean> {
  const rows = await db
    .update(chatMessages)
    .set({ hiddenAt: null })
    .where(and(eq(chatMessages.id, id), sql`${chatMessages.hiddenAt} is not null`))
    .returning({ id: chatMessages.id });
  return rows.length > 0;
}

/** 30일 지난 메시지를 지운다(정리 잡). */
export async function purgeOldMessages(db: Db, now: Date): Promise<number> {
  const rows = await db
    .delete(chatMessages)
    .where(sql`${chatMessages.createdAt} < ${new Date(now.getTime() - CHAT_RETENTION_MS)}`)
    .returning({ id: chatMessages.id });
  return rows.length;
}

/** 차단 목록(최근 차단 먼저). 차단한 사람의 지금 닉네임·캐릭터를 싣는다(해제 화면). */
export async function listBlocks(db: DbExecutor, userId: string) {
  const rows = await db
    .select({ userId: chatBlocks.blockedUserId, nickname: users.nickname, avatar: users.avatar, createdAt: chatBlocks.createdAt })
    .from(chatBlocks)
    .innerJoin(users, eq(users.id, chatBlocks.blockedUserId))
    .where(eq(chatBlocks.userId, userId))
    .orderBy(desc(chatBlocks.createdAt), asc(chatBlocks.blockedUserId));
  return rows.map((row) => ({ user_id: row.userId, nickname: row.nickname, avatar: row.avatar, blocked_at: row.createdAt.toISOString() }));
}

export type BlockView = Awaited<ReturnType<typeof listBlocks>>[number];
