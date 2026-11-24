import { randomUUID } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

export interface TestSession {
  cookie: string;
  csrf: string;
  userId: string;
  res: LightMyRequestResponse;
}

export function cookieFrom(res: LightMyRequestResponse): string | undefined {
  const found = res.cookies.find((c) => c.name === 'sv_session');
  return found ? `sv_session=${found.value}` : undefined;
}

/** `POST /auth/start`로 새 익명 계정을 만든다. */
export async function startAnonymous(
  app: FastifyInstance,
  options: { remoteAddress?: string; key?: string; cookie?: string } = {},
): Promise<TestSession> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/start',
    remoteAddress: options.remoteAddress,
    headers: {
      'idempotency-key': options.key ?? randomUUID(),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
  });
  if (res.statusCode !== 200) throw new Error(`/auth/start ${res.statusCode}: ${res.body}`);
  const body = res.json();
  return { cookie: cookieFrom(res) ?? options.cookie ?? '', csrf: body.data.csrf_token, userId: body.data.user.id, res };
}

export const authHeaders = (session: Pick<TestSession, 'cookie' | 'csrf'>) => ({
  cookie: session.cookie,
  'x-csrf-token': session.csrf,
});

export const withKey = (session: Pick<TestSession, 'cookie' | 'csrf'>) => ({
  ...authHeaders(session),
  'content-type': 'application/json',
  'idempotency-key': randomUUID(),
});
