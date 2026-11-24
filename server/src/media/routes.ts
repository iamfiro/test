import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { errors } from '../http/errors.js';
import { DiskStorage } from './disk.js';
import { sniffImage } from './image.js';
import { parseMultipartFile } from './multipart.js';
import { IMMUTABLE_CACHE } from './storage.js';

/** 업로드 파일. 멱등 요청 지문(JSON)에는 내용의 해시만 들어가 경계 문자열이 달라도 같은 요청으로 본다. */
export class UploadedFile {
  constructor(readonly bytes: Buffer) {}
  toJSON() {
    return { size: this.bytes.length, sha256: createHash('sha256').update(this.bytes).digest('hex') };
  }
}

/** multipart 본문의 `file` 필드. 없거나 형식이 틀리면 `file: null`(경로가 422로 답한다). */
export interface UploadBody {
  file: UploadedFile | null;
}

/** 서버가 만드는 미디어 키 모양(개발 서버가 내줄 때 이것만 받는다). */
const SERVED_KEY = /^rooms\/[0-9a-f-]{36}\/(banner|logo)\/[0-9a-f]{32}$/;

export function registerMediaParsing(app: FastifyInstance): void {
  // 본문 크기는 경로의 bodyLimit(이미지 경로만 크게)이 먼저 막는다. 다른 경로는 전역 64KB 그대로다.
  app.addContentTypeParser('multipart/form-data', { parseAs: 'buffer' }, (request, body, done) => {
    const bytes = parseMultipartFile(body as Buffer, String(request.headers['content-type'] ?? ''), 'file');
    done(null, { file: bytes ? new UploadedFile(bytes) : null } satisfies UploadBody);
  });
}

/** 디스크 저장소일 때(로컬 개발) 올린 파일을 `/media/<key>`로 내준다. 운영(R2)은 공개 미디어 도메인이 내준다. */
export function registerDiskMediaRoute(app: FastifyInstance, storage: DiskStorage): void {
  app.get('/media/*', { config: { auth: 'none', rateLimit: false } }, async (request, reply) => {
    const key = (request.params as { '*': string })['*'];
    const bytes = SERVED_KEY.test(key) ? await storage.read(key) : null;
    const info = bytes ? sniffImage(bytes) : null;
    if (!bytes || !info) throw errors.notFound();
    return reply.header('content-type', info.type).header('cache-control', IMMUTABLE_CACHE).send(bytes);
  });
}
