import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * `data`의 ETag(약한 검증자, 본문 SHA-256 앞 16바이트). `If-None-Match`가 같으면 304로 끝낸다. 봉투의 `meta`
 * (요청 id·시각)는 매번 달라 해시에 넣지 않는다.
 */
export function replyWithEtag(request: FastifyRequest, reply: FastifyReply, data: unknown): FastifyReply {
  const etag = `W/"${createHash('sha256').update(JSON.stringify(data)).digest('base64url').slice(0, 22)}"`;
  reply.header('etag', etag);
  reply.header('cache-control', 'private, no-cache');
  const match = request.headers['if-none-match'];
  if (typeof match === 'string' && match.split(',').some((value) => value.trim() === etag)) return reply.code(304).send();
  return reply.ok(data);
}
