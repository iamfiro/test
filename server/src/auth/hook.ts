import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { errors } from '../http/errors.js';
import { findSession, setSessionCookie, SESSION_COOKIE, type AuthContext } from './session.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * `required`(기본): 세션이 없으면 401, 쓰기 요청은 CSRF 토큰 확인.
     * `optional`: 세션이 있으면 읽고, 있는데 쓰기 요청이면 `csrf: false`가 아닌 한 CSRF 확인.
     * `none`: 세션을 보지 않는다.
     */
    auth?: 'required' | 'optional' | 'none';
    /** `false`면 세션이 있어도 CSRF 토큰을 확인하지 않는다(로그인 계열). */
    csrf?: boolean;
    /** true면 만료 연장을 간격 없이 한다(`GET /auth/session`). */
    touchSession?: boolean;
  }
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('auth', undefined);

  app.addHook('onRequest', async (request, reply) => {
    if (request.is404) return; // 없는 경로는 404로 답한다
    const config = request.routeOptions.config;
    const mode = config.auth ?? 'required';
    if (mode === 'none') return;

    const token = request.cookies[SESSION_COOKIE];
    const found = token ? await findSession(app.db, token, { touch: config.touchSession ? 'always' : 'throttled' }) : null;
    if (!found) {
      if (mode === 'required') throw errors.unauthorized();
      return;
    }

    if (WRITE_METHODS.has(request.method) && config.csrf !== false) {
      const sent = request.headers['x-csrf-token'];
      if (typeof sent !== 'string' || !sameToken(sent, found.csrfToken)) {
        throw errors.csrfRejected('CSRF 토큰이 없거나 맞지 않아요');
      }
    }

    request.auth = found;
    request.idempotencyScope = `user:${found.user.id}`;
    if (token && found.touched) setSessionCookie(reply, token); // 쿠키 수명도 마지막 사용 기준으로 민다
  });
}
