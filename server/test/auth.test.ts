import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, cookieFrom, startAnonymous } from './helpers/session.js';

async function count(app: FastifyInstance, table: string): Promise<number> {
  const result = await app.db.execute(sql.raw(`select count(*)::int as n from ${table}`));
  return Number((result.rows[0] as { n: number }).n);
}

describe('익명 계정·세션', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({ env: { ACCOUNT_CREATE_PER_IP_PER_HOUR: '3', DEV_LOGIN_ENABLED: 'true' } });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
  });

  describe('POST /auth/start', () => {
    it('쿠키 없는 첫 요청은 익명 계정을 만들고 세션 쿠키를 심는다', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/start', headers: { 'idempotency-key': randomUUID() } });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expectContract('/auth/start', 'post', 200, body);

      const user = body.data.user;
      expect([...new Intl.Segmenter().segment(user.profile.nickname)].length).toBeLessThanOrEqual(12);
      expect(user.profile.nickname.length).toBeGreaterThan(0);
      expect(user.profile.gender).toBeNull();
      expect(user.profile.tags).toEqual([]);
      expect(user.onboarding_completed_at).toBeNull();
      expect(typeof body.data.csrf_token).toBe('string');
      expect(await count(app, 'users')).toBe(1);

      const cookie = res.cookies.find((c) => c.name === 'sv_session')!;
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.secure).toBe(true);
      expect(cookie.sameSite).toBe('Lax');
      expect(cookie.path).toBe('/');
      expect(cookie.domain).toBeUndefined();
      // 마지막 사용으로부터 180일
      expect(cookie.maxAge).toBe(180 * 24 * 60 * 60);
    });

    it('세션 쿠키 원문은 저장하지 않고 해시만 저장한다', async () => {
      const session = await startAnonymous(app);
      const raw = session.cookie.split('=')[1]!;
      const rows = (await app.db.execute(sql`select id_hash from sessions`)).rows as { id_hash: string }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id_hash).not.toContain(raw);
      expect(rows[0]!.id_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('이미 세션이 있으면 같은 계정을 돌려주고 새 계정을 만들지 않는다', async () => {
      const first = await startAnonymous(app);
      const second = await startAnonymous(app, { cookie: first.cookie });
      expect(second.userId).toBe(first.userId);
      expect(second.csrf).toBe(first.csrf);
      expect(await count(app, 'users')).toBe(1);
    });

    it('Idempotency-Key가 없으면 400', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/start' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(await count(app, 'users')).toBe(0);
    });

    it('같은 키 재전송(쿠키를 못 받은 재시도)은 같은 계정에 새 세션을 준다', async () => {
      const key = randomUUID();
      const first = await app.inject({ method: 'POST', url: '/auth/start', headers: { 'idempotency-key': key } });
      const second = await app.inject({ method: 'POST', url: '/auth/start', headers: { 'idempotency-key': key } });
      expect(second.statusCode).toBe(200);
      expect(second.json().data.user.id).toBe(first.json().data.user.id);
      expect(cookieFrom(second)).toBeDefined();
      expect(cookieFrom(second)).not.toBe(cookieFrom(first));
      expect(await count(app, 'users')).toBe(1);
      expect(await count(app, 'sessions')).toBe(2);
    });

    it('같은 키로 동시에 두 요청이 와도 계정은 하나만 만든다', async () => {
      const key = randomUUID();
      const send = () => app.inject({ method: 'POST', url: '/auth/start', headers: { 'idempotency-key': key } });
      const [a, b] = await Promise.all([send(), send()]);
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      expect(a.json().data.user.id).toBe(b.json().data.user.id);
      expect(await count(app, 'users')).toBe(1);
    });

    it('IP당 시간당 새 계정 수 상한을 넘으면 429 ACCOUNT_RATE_LIMITED', async () => {
      for (let i = 0; i < 3; i += 1) await startAnonymous(app, { remoteAddress: '203.0.113.7' });
      const res = await app.inject({
        method: 'POST',
        url: '/auth/start',
        remoteAddress: '203.0.113.7',
        headers: { 'idempotency-key': randomUUID() },
      });
      expect(res.statusCode).toBe(429);
      expect(res.json().error.code).toBe('ACCOUNT_RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expectContract('/auth/start', 'post', 429, res.json());
      expect(await count(app, 'users')).toBe(3);

      // 다른 IP는 영향 없다
      const other = await startAnonymous(app, { remoteAddress: '203.0.113.8' });
      expect(other.userId).toBeDefined();
    });

    it('상한에 걸려도 이미 세션이 있는 사람은 계속 들어온다', async () => {
      const mine = await startAnonymous(app, { remoteAddress: '203.0.113.9' });
      await startAnonymous(app, { remoteAddress: '203.0.113.9' });
      await startAnonymous(app, { remoteAddress: '203.0.113.9' });
      const again = await startAnonymous(app, { remoteAddress: '203.0.113.9', cookie: mine.cookie });
      expect(again.userId).toBe(mine.userId);
    });
  });

  describe('GET /auth/session', () => {
    it('쿠키가 없으면 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/auth/session' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
      expectContract('/auth/session', 'get', 401, res.json());
    });

    it('쓸 수 없는 쿠키 값도 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: 'sv_session=garbage' } });
      expect(res.statusCode).toBe(401);
    });

    it('세션이 있으면 사용자와 CSRF 토큰을 준다', async () => {
      const session = await startAnonymous(app);
      const res = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: session.cookie } });
      expect(res.statusCode).toBe(200);
      expectContract('/auth/session', 'get', 200, res.json());
      expect(res.json().data.csrf_token).toBe(session.csrf);
      expect(res.json().data.user.id).toBe(session.userId);
    });

    it('만료된 세션은 401', async () => {
      const session = await startAnonymous(app);
      await app.db.execute(sql`update sessions set expires_at = now() - interval '1 second'`);
      const res = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: session.cookie } });
      expect(res.statusCode).toBe(401);
    });

    it('쓸 때마다 만료를 마지막 사용으로부터 180일 뒤로 민다', async () => {
      const session = await startAnonymous(app);
      await app.db.execute(
        sql`update sessions set last_used_at = now() - interval '30 days', expires_at = now() + interval '150 days'`,
      );
      const res = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: session.cookie } });
      expect(res.statusCode).toBe(200);
      const rows = (
        await app.db.execute(sql`select extract(epoch from (expires_at - now())) / 86400 as days from sessions`)
      ).rows as { days: string }[];
      expect(Number(rows[0]!.days)).toBeGreaterThan(179.9);
      // 쿠키 수명도 같이 민다
      expect(res.cookies.find((c) => c.name === 'sv_session')?.maxAge).toBe(180 * 24 * 60 * 60);
    });
  });

  describe('CSRF', () => {
    it('상태를 바꾸는 요청에 CSRF 토큰이 없거나 틀리면 403이고 세션은 그대로다', async () => {
      const session = await startAnonymous(app);
      const none = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: session.cookie } });
      const wrong = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { cookie: session.cookie, 'x-csrf-token': 'wrong' },
      });
      expect(none.statusCode).toBe(403);
      expect(none.json().error.code).toBe('CSRF_REJECTED');
      expect(wrong.statusCode).toBe(403);
      expectContract('/auth/logout', 'post', 403, none.json());
      expect(await count(app, 'sessions')).toBe(1);
    });

    it('다른 사람의 CSRF 토큰으로는 통하지 않는다', async () => {
      const a = await startAnonymous(app);
      const b = await startAnonymous(app);
      const res = await app.inject({
        method: 'DELETE',
        url: '/users/me',
        headers: { cookie: a.cookie, 'x-csrf-token': b.csrf },
      });
      expect(res.statusCode).toBe(403);
      expect(await count(app, 'users')).toBe(2);
    });
  });

  describe('로그아웃', () => {
    it('로그아웃하면 세션을 지우고 쿠키를 만료시킨다', async () => {
      const session = await startAnonymous(app);
      const res = await app.inject({ method: 'POST', url: '/auth/logout', headers: authHeaders(session) });
      expect(res.statusCode).toBe(204);
      expect(res.cookies.find((c) => c.name === 'sv_session')?.maxAge).toBe(0);
      expect(await count(app, 'sessions')).toBe(0);
      expect(await count(app, 'users')).toBe(1);
      const after = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: session.cookie } });
      expect(after.statusCode).toBe(401);
    });

    it('세션이 이미 없어도 204', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/logout' });
      expect(res.statusCode).toBe(204);
    });

    it('모든 기기 로그아웃은 이 사용자의 세션을 전부 지운다', async () => {
      const first = await startAnonymous(app);
      const second = await app.inject({
        method: 'POST',
        url: '/auth/start',
        headers: { 'idempotency-key': randomUUID(), cookie: first.cookie },
      });
      expect(second.statusCode).toBe(200);
      // 같은 계정에 세션 하나를 더 만든다(같은 키 재전송 경로)
      const key = randomUUID();
      const other = await app.inject({ method: 'POST', url: '/auth/start', headers: { 'idempotency-key': key } });
      const otherReplay = await app.inject({ method: 'POST', url: '/auth/start', headers: { 'idempotency-key': key } });
      expect(await count(app, 'sessions')).toBe(3);

      const res = await app.inject({ method: 'POST', url: '/auth/logout-all', headers: authHeaders(first) });
      expect(res.statusCode).toBe(204);
      expect(await count(app, 'sessions')).toBe(2); // 다른 사용자의 두 세션은 그대로
      const stillThere = await app.inject({
        method: 'GET',
        url: '/auth/session',
        headers: { cookie: cookieFrom(otherReplay)! },
      });
      expect(stillThere.statusCode).toBe(200);
      expect(stillThere.json().data.user.id).toBe(other.json().data.user.id);
    });

    it('모든 기기 로그아웃은 세션이 없으면 401', async () => {
      const res = await app.inject({ method: 'POST', url: '/auth/logout-all' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('DELETE /users/me (내 데이터 지우기)', () => {
    it('즉시 삭제하고 세션을 끊고 쿠키를 지운다', async () => {
      const session = await startAnonymous(app);
      const res = await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(session) });
      expect(res.statusCode).toBe(204);
      expect(res.cookies.find((c) => c.name === 'sv_session')?.maxAge).toBe(0);
      expect(await count(app, 'users')).toBe(0);
      expect(await count(app, 'sessions')).toBe(0);
      const after = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: session.cookie } });
      expect(after.statusCode).toBe(401);
    });

    it('사용자 id 열(user_id, *_user_id)이 있는 모든 테이블에 이 사용자의 흔적이 남지 않는다', async () => {
      const session = await startAnonymous(app);
      await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(session) });
      const columns = (
        await app.db.execute(
          sql`select table_name, column_name from information_schema.columns
              where table_schema = 'public' and (column_name = 'user_id' or column_name like '%\_user\_id')`,
        )
      ).rows as { table_name: string; column_name: string }[];
      expect(columns.map((c) => `${c.table_name}.${c.column_name}`)).toContain('reports.reporter_user_id');
      for (const { table_name: table, column_name: column } of columns) {
        const rows = (
          await app.db.execute(sql.raw(`select count(*)::int as n from "${table}" where "${column}" = '${session.userId}'`))
        ).rows as { n: number }[];
        expect(rows[0]!.n, `${table}.${column}`).toBe(0);
      }
    });

    it('지운 뒤 시작하면 새 사람이다', async () => {
      const old = await startAnonymous(app);
      await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(old) });
      const fresh = await startAnonymous(app, { cookie: old.cookie });
      expect(fresh.userId).not.toBe(old.userId);
      expect(fresh.cookie).not.toBe(old.cookie);
    });

    it('세션이 없으면 401', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/users/me' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('개발 전용 로그인', () => {
    it('켜 있으면 같은 subject는 같은 계정이다', async () => {
      const send = () =>
        app.inject({
          method: 'POST',
          url: '/auth/login/dev',
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ subject: 'tester_1' }),
        });
      const first = await send();
      const second = await send();
      expect(first.statusCode).toBe(200);
      expectContract('/auth/login/dev', 'post', 200, first.json());
      expect(second.json().data.user.id).toBe(first.json().data.user.id);
      expect(cookieFrom(first)).toBeDefined();
    });

    it('subject 형식이 틀리면 422', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login/dev',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ subject: 'Bad Subject!' }),
      });
      expect(res.statusCode).toBe(422);
    });

    it('꺼 있으면 404', async () => {
      const off = await createTestApp({ env: { DEV_LOGIN_ENABLED: 'false' } });
      const res = await off.inject({
        method: 'POST',
        url: '/auth/login/dev',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ subject: 'tester_1' }),
      });
      await off.close();
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('세션이 필요한 경로', () => {
    it('쿠키 없이 부르면 401이고 아무것도 실행하지 않는다', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/users/me/profile',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        payload: JSON.stringify({ nickname: 'x' }),
      });
      expect(res.statusCode).toBe(401);
      expect(await count(app, 'idempotency_keys')).toBe(0);
    });
  });
});
