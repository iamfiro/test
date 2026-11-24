import { and, desc, eq, inArray, max } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { presenceSpans, studyRoomMembers, studySessions, users, type AvatarValue, type SegmentValue } from '../db/schema.js';
import { roomView } from '../rooms/views.js';
import { totalMs, union } from '../study/intervals.js';
import { PRESENCE_MAX_GAP_MS } from '../study/timer.js';
import { splitByStudyDate, studyDateOf, studyDayStart } from '../study/time.js';
import type { LiveEvent } from './bus.js';

/**
 * 방 실시간 상태(docs/contracts/study-room-live.md). 구독자가 있는 방만 메모리에 둔다(서버 1대, 결정 M7).
 * 방마다 일을 한 줄로 세운다(스냅샷·변경·순위 다시 매기기): 스냅샷 `seq` 뒤의 변경이 빠지거나 앞서지 않는다.
 * 서버가 판정하는 것: 상태(공부 중·쉬는 중·자리 비움), 이번 세션 흐른 초, 오늘 공부 초, 순위.
 */

export type LiveStatus = 'studying' | 'paused' | 'away';
export type LeaveReason = 'left' | 'removed' | 'account_deleted';

export interface LiveMember {
  user_id: string;
  nickname: string;
  avatar: AvatarValue;
  gender: 'male' | 'female' | null;
  seat: number;
  is_host: boolean;
  status: LiveStatus;
  session_seconds: number;
  as_of: string;
  today_seconds: number;
  rank: number | null;
}

export interface LiveRoomInfo {
  id: string;
  name: string;
  description: string | null;
  map: string;
  capacity: number;
  has_password: boolean;
  host_user_id: string;
  banner: { id: string; url: string } | null;
  logo: { id: string; url: string } | null;
  tags: { id: string; kind: string; name: string }[];
}

export type LiveRoomEvent =
  | { type: 'room_state'; topic: string; seq: number; server_time: string; room: LiveRoomInfo; members: LiveMember[] }
  | { type: 'member_joined' | 'member_updated'; topic: string; seq: number; member: LiveMember }
  | { type: 'member_left'; topic: string; seq: number; user_id: string; reason: LeaveReason }
  | { type: 'room_updated'; topic: string; seq: number; room: LiveRoomInfo }
  | { type: 'room_deleted'; topic: string; seq: number };

/** 소켓 허브가 넘기는 출구. */
export interface LiveSink {
  /** 그 토픽의 지금 구독자 모두에게 보낸다. */
  broadcast(topic: string, event: LiveRoomEvent): void;
  /** 그 사용자의 연결을 토픽에서 뺀다(내보내기·나가기·계정 삭제). */
  evictUser(topic: string, userId: string): void;
  /** 토픽의 모든 연결을 뺀다(방 삭제). */
  evictAll(topic: string): void;
  hasSubscribers(topic: string): boolean;
}

interface MemberState {
  userId: string;
  nickname: string;
  avatar: AvatarValue;
  gender: 'male' | 'female' | null;
  seat: number;
  session: { id: string; segments: SegmentValue[] } | null;
  /**
   * 진행 중 세션의 마지막 presence 수신 시각. DB의 관측 구간 끝에서 시작하고, 이 서버가 신호를 받을 때마다 민다
   * (일시정지 중 75초 넘게 끊겼다 돌아온 신호는 관측 구간을 새로 열지 않지만 화면은 열려 있다: 쉬는 중으로 본다).
   */
  lastSeenAt: number | null;
  todaySeconds: number;
  /** `todaySeconds`를 센 공부일·시간대(공부일이 바뀌면 다시 읽는다). 세션이 한 번도 없으면 null. */
  today: { date: string; timezone: string } | null;
}

interface LiveRoom {
  roomId: string;
  topic: string;
  seq: number;
  info: LiveRoomInfo;
  hostUserId: string;
  members: Map<string, MemberState>;
  /** 마지막으로 보낸 멤버 항목의 비교 키(바뀐 것만 다시 보낸다). */
  sentKeys: Map<string, string>;
}

export const roomTopic = (roomId: string) => `room:${roomId}`;

const focusedMs = (segments: SegmentValue[], nowMs: number) =>
  totalMs(union(segments.map((s) => [Date.parse(s.started_at), s.ended_at === null ? nowMs : Date.parse(s.ended_at)] as const)));

const isRunning = (segments: SegmentValue[]) => segments[segments.length - 1]?.ended_at === null;

/** 상태 규칙: 세션 없음 → 자리 비움(앱 `studyPresenceOf`), presence가 75초 끊김 → 자리 비움, 흐름 → 공부 중, 일시정지 → 쉬는 중. */
export function statusOf(state: Pick<MemberState, 'session' | 'lastSeenAt'>, nowMs: number): LiveStatus {
  if (!state.session) return 'away';
  if (state.lastSeenAt === null || nowMs - state.lastSeenAt > PRESENCE_MAX_GAP_MS) return 'away';
  return isRunning(state.session.segments) ? 'studying' : 'paused';
}

export class LiveRooms {
  private readonly rooms = new Map<string, LiveRoom>();
  /** 살아 있는 방의 멤버 → 방 id(타이머·프로필 변경이 어느 방 일인지 DB 없이 안다). */
  private readonly userRoom = new Map<string, string>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
    private readonly mediaUrl: (key: string) => string,
    private readonly sink: LiveSink,
    private readonly onError: (error: unknown) => void,
  ) {}

  /** 그 방의 일을 줄 끝에 넣고 끝날 때까지 기다린다(오류는 호출자에게 그대로). */
  run<T>(roomId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(roomId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    const tail = next.catch(() => undefined);
    this.queues.set(roomId, tail);
    void tail.then(() => {
      if (this.queues.get(roomId) === tail) this.queues.delete(roomId);
    });
    return next;
  }

  /** 줄 안에서 부른다: 방을 메모리에 올리고(없으면) 지금 스냅샷을 돌려준다. 방이 없으면 null. */
  async snapshot(roomId: string): Promise<LiveRoomEvent | null> {
    let room = this.rooms.get(roomId);
    if (!room) {
      const loaded = await this.load(roomId);
      if (!loaded) return null;
      room = loaded;
    }
    const nowMs = this.now().getTime();
    const items = this.items(room, nowMs);
    for (const item of items) room.sentKeys.set(item.user_id, keyOf(item, room.members.get(item.user_id)!));
    return {
      type: 'room_state',
      topic: room.topic,
      seq: room.seq,
      server_time: new Date(nowMs).toISOString(),
      room: room.info,
      members: items.sort((a, b) => a.seat - b.seat),
    };
  }

  /** 구독자가 모두 떠난 방을 메모리에서 내린다. */
  release(roomId: string): void {
    void this.run(roomId, async () => {
      if (this.sink.hasSubscribers(roomTopic(roomId))) return;
      this.drop(roomId);
    }).catch(this.onError);
  }

  /** 버스 이벤트 가운데 방 상태에 닿는 것(타이머·방·프로필)을 처리한다. */
  handle(event: LiveEvent): Promise<void> {
    switch (event.kind) {
      case 'timer':
      case 'profile': {
        const roomId = this.userRoom.get(event.userId);
        if (!roomId) return Promise.resolve();
        // presence는 공부하는 사람마다 30초쯤마다 온다: 서버가 지금 받은 신호이므로 DB를 다시 읽지 않고 마지막 관측만 민다.
        if (event.kind === 'timer' && event.change === 'observed') return this.run(roomId, async () => this.observed(roomId, event.userId));
        return this.run(roomId, () => this.refreshMember(roomId, event.userId));
      }
      case 'room': {
        const change = event.change;
        if (!this.rooms.has(change.roomId)) return Promise.resolve();
        switch (change.type) {
          case 'room_created':
            return Promise.resolve();
          case 'room_updated':
            return this.run(change.roomId, () => this.refreshRoom(change.roomId));
          case 'room_deleted':
            return this.run(change.roomId, async () => this.deleted(change.roomId));
          case 'member_joined':
          case 'member_moved':
            return this.run(change.roomId, () => this.refreshMember(change.roomId, change.userId));
          case 'member_left':
            return this.run(change.roomId, async () => this.left(change.roomId, change.userId, change.reason));
        }
        return Promise.resolve();
      }
      default:
        return Promise.resolve();
    }
  }

  /**
   * 시간이 흘러 바뀌는 것을 다시 본다: presence 75초 끊김(→ 자리 비움), 흐르는 사람이 멈춘 사람을 앞지른 순위,
   * 공부일(04:00)이 바뀐 사람의 오늘 공부 초. 운영은 몇 초마다 부르고 테스트는 시계를 옮긴 뒤 직접 부른다.
   */
  async sweep(): Promise<void> {
    await Promise.all(
      [...this.rooms.keys()].map((roomId) =>
        this.run(roomId, async () => {
          const room = this.rooms.get(roomId);
          if (!room) return;
          const nowMs = this.now().getTime();
          for (const state of room.members.values()) {
            if (state.today && studyDateOf(nowMs, state.today.timezone) !== state.today.date) {
              const [fresh] = await this.loadMembers(roomId, [state.userId]);
              if (fresh) {
                if (fresh.session && fresh.session.id === state.session?.id && state.lastSeenAt !== null) {
                  fresh.lastSeenAt = Math.max(fresh.lastSeenAt ?? 0, state.lastSeenAt);
                }
                room.members.set(state.userId, fresh);
              }
            }
          }
          this.emitChanges(room, nowMs, null);
        }),
      ),
    );
  }

  private async load(roomId: string): Promise<LiveRoom | null> {
    const info = await this.roomInfo(roomId);
    if (!info) return null;
    const members = await this.loadMembers(roomId, null);
    const room: LiveRoom = {
      roomId,
      topic: roomTopic(roomId),
      seq: 0,
      info,
      hostUserId: info.host_user_id,
      members: new Map(members.map((m) => [m.userId, m])),
      sentKeys: new Map(),
    };
    this.rooms.set(roomId, room);
    for (const member of members) this.userRoom.set(member.userId, roomId);
    return room;
  }

  private drop(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const userId of room.members.keys()) if (this.userRoom.get(userId) === roomId) this.userRoom.delete(userId);
    this.rooms.delete(roomId);
  }

  private async roomInfo(roomId: string): Promise<LiveRoomInfo | null> {
    const found = await roomView({ db: this.db, viewerId: null, now: this.now(), passwordKey: Buffer.alloc(0), mediaUrl: this.mediaUrl }, roomId);
    if (!found) return null;
    const { room, row } = found;
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      map: room.map,
      capacity: room.capacity,
      has_password: room.has_password,
      host_user_id: row.hostUserId,
      banner: room.banner,
      logo: room.logo,
      tags: room.tags,
    };
  }

  /** 멤버 상태를 DB에서 읽는다(`userIds`가 null이면 방 전원). 이 방 멤버가 아니면 결과에 없다. */
  private async loadMembers(roomId: string, userIds: string[] | null): Promise<MemberState[]> {
    const base = await this.db
      .select({ userId: users.id, nickname: users.nickname, avatar: users.avatar, gender: users.gender, seat: studyRoomMembers.seat })
      .from(studyRoomMembers)
      .innerJoin(users, eq(users.id, studyRoomMembers.userId))
      .where(userIds === null ? eq(studyRoomMembers.roomId, roomId) : and(eq(studyRoomMembers.roomId, roomId), inArray(studyRoomMembers.userId, userIds)));
    if (base.length === 0) return [];
    const ids = base.map((m) => m.userId);

    const active = await this.db
      .select({ id: studySessions.id, userId: studySessions.userId, segments: studySessions.segments, timezone: studySessions.timezone })
      .from(studySessions)
      .where(and(inArray(studySessions.userId, ids), eq(studySessions.status, 'active')));
    const seen = active.length
      ? await this.db
          .select({ sessionId: presenceSpans.sessionId, last: max(presenceSpans.endedAt) })
          .from(presenceSpans)
          .where(inArray(presenceSpans.sessionId, active.map((s) => s.id)))
          .groupBy(presenceSpans.sessionId)
      : [];
    const lastSeen = new Map(seen.map((row) => [row.sessionId, row.last ? new Date(row.last).getTime() : null]));

    // 오늘 공부 초: 그 사람의 시간대(진행 중 세션, 없으면 마지막으로 끝낸 세션의 것)로 본 오늘(04:00 경계)에 든 끝낸 기록.
    const latest = await this.db
      .selectDistinctOn([studySessions.userId], { userId: studySessions.userId, timezone: studySessions.timezone })
      .from(studySessions)
      .where(and(inArray(studySessions.userId, ids), eq(studySessions.status, 'finished')))
      .orderBy(studySessions.userId, desc(studySessions.endedAt));
    const timezoneOf = new Map(latest.map((row) => [row.userId, row.timezone]));
    for (const session of active) timezoneOf.set(session.userId, session.timezone);
    const nowMs = this.now().getTime();
    const today = new Map<string, { date: string; timezone: string; start: number }>();
    for (const [userId, timezone] of timezoneOf) {
      const date = studyDateOf(nowMs, timezone);
      today.set(userId, { date, timezone, start: studyDayStart(date, timezone) });
    }
    const todayMs = new Map<string, number>();
    const withToday = [...today.keys()];
    if (withToday.length > 0) {
      const earliest = Math.min(...[...today.values()].map((t) => t.start));
      const finished = await this.db
        .select({ userId: studySessions.userId, segments: studySessions.segments, endedAt: studySessions.endedAt })
        .from(studySessions)
        .where(and(inArray(studySessions.userId, withToday), eq(studySessions.status, 'finished')));
      for (const session of finished) {
        if (!session.endedAt || session.endedAt.getTime() <= earliest) continue;
        const t = today.get(session.userId)!;
        const intervals = session.segments.map((s) => [Date.parse(s.started_at), Date.parse(s.ended_at!)] as const);
        for (const piece of splitByStudyDate(intervals, t.timezone)) {
          if (piece.date === t.date) todayMs.set(session.userId, (todayMs.get(session.userId) ?? 0) + piece.end - piece.start);
        }
      }
    }

    return base.map((m) => {
      const session = active.find((s) => s.userId === m.userId);
      const t = today.get(m.userId);
      return {
        userId: m.userId,
        nickname: m.nickname,
        avatar: m.avatar,
        gender: m.gender,
        seat: m.seat,
        session: session ? { id: session.id, segments: session.segments } : null,
        lastSeenAt: session ? (lastSeen.get(session.id) ?? null) : null,
        todaySeconds: Math.floor((todayMs.get(m.userId) ?? 0) / 1000),
        today: t ? { date: t.date, timezone: t.timezone } : null,
      };
    });
  }

  /** 지금 시각의 멤버 항목(순위 포함). */
  private items(room: LiveRoom, nowMs: number): LiveMember[] {
    const asOf = new Date(nowMs).toISOString();
    const base = [...room.members.values()].map((state) => {
      const status = statusOf(state, nowMs);
      const ms = state.session ? focusedMs(state.session.segments, nowMs) : 0;
      return { state, status, ms };
    });
    // 순위(앱 study_live_ranking_sheet.dart의 실시간 순위): 머리 위 시간(이번 세션 흐른 시간)이 긴 순. 자리 비움과
    // 0초는 순위 없음. 같으면 닉네임, 그다음 id 순(서버는 보는 사람마다 다르게 매기지 않는다: 앱의 "나 먼저"는 화면 몫이 아님).
    const ranked = base
      .filter((m) => m.status !== 'away' && m.ms >= 1000)
      .sort((a, b) => b.ms - a.ms || a.state.nickname.localeCompare(b.state.nickname) || a.state.userId.localeCompare(b.state.userId));
    const rankOf = new Map(ranked.map((m, i) => [m.state.userId, i + 1]));
    return base.map(({ state, status, ms }) => ({
      user_id: state.userId,
      nickname: state.nickname,
      avatar: state.avatar,
      gender: state.gender,
      seat: state.seat,
      is_host: state.userId === room.hostUserId,
      status,
      session_seconds: Math.floor(ms / 1000),
      as_of: asOf,
      today_seconds: state.todaySeconds,
      rank: rankOf.get(state.userId) ?? null,
    }));
  }

  /**
   * 지금 항목을 다시 매겨 바뀐 사람만 `member_updated`로 보낸다. `primary`(방금 들어온 사람)는 `member_joined`로
   * 먼저 보낸다.
   */
  private emitChanges(room: LiveRoom, nowMs: number, primary: { userId: string; joined: boolean } | null): void {
    const items = this.items(room, nowMs);
    const ordered = primary ? [...items.filter((i) => i.user_id === primary.userId), ...items.filter((i) => i.user_id !== primary.userId)] : items;
    for (const item of ordered) {
      const key = keyOf(item, room.members.get(item.user_id)!);
      const joined = primary?.joined === true && item.user_id === primary.userId;
      if (!joined && room.sentKeys.get(item.user_id) === key) continue;
      room.sentKeys.set(item.user_id, key);
      room.seq += 1;
      this.sink.broadcast(room.topic, { type: joined ? 'member_joined' : 'member_updated', topic: room.topic, seq: room.seq, member: item });
    }
  }

  private async refreshMember(roomId: string, userId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const [fresh] = await this.loadMembers(roomId, [userId]);
    if (!fresh) return; // 그 사이 나갔다: member_left가 따로 온다
    const before = room.members.get(userId);
    const joined = !before;
    if (before?.session && fresh.session?.id === before.session.id && before.lastSeenAt !== null) {
      fresh.lastSeenAt = Math.max(fresh.lastSeenAt ?? 0, before.lastSeenAt);
    }
    room.members.set(userId, fresh);
    this.userRoom.set(userId, roomId);
    this.emitChanges(room, this.now().getTime(), { userId, joined });
  }

  private observed(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    const state = room?.members.get(userId);
    if (!room || !state?.session) return;
    const nowMs = this.now().getTime();
    state.lastSeenAt = Math.max(state.lastSeenAt ?? 0, nowMs);
    this.emitChanges(room, nowMs, null);
  }

  private async refreshRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const info = await this.roomInfo(roomId);
    if (!info) return; // 지워졌다: room_deleted가 따로 온다
    room.info = info;
    room.seq += 1;
    this.sink.broadcast(room.topic, { type: 'room_updated', topic: room.topic, seq: room.seq, room: info });
  }

  private left(roomId: string, userId: string, reason: LeaveReason): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.members.delete(userId);
    room.sentKeys.delete(userId);
    if (this.userRoom.get(userId) === roomId) this.userRoom.delete(userId);
    room.seq += 1;
    this.sink.broadcast(room.topic, { type: 'member_left', topic: room.topic, seq: room.seq, user_id: userId, reason });
    this.sink.evictUser(room.topic, userId);
    this.emitChanges(room, this.now().getTime(), null); // 남은 사람의 순위
  }

  private deleted(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.seq += 1;
    this.sink.broadcast(room.topic, { type: 'room_deleted', topic: room.topic, seq: room.seq });
    this.sink.evictAll(room.topic);
    this.drop(roomId);
  }
}

/** 다시 보낼지 정하는 비교 키: 흐르는 초(`as_of`마다 바뀜)는 빼고, 세션 구간이 바뀌면 다르게 본다. */
function keyOf(item: LiveMember, state: MemberState): string {
  return JSON.stringify([
    item.nickname,
    item.avatar,
    item.gender,
    item.seat,
    item.is_host,
    item.status,
    item.today_seconds,
    item.rank,
    state.session?.segments ?? null,
  ]);
}
