import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MediaStorage } from '../src/media/storage.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { jpeg, multipart, PNG_1X1, webp } from './helpers/images.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';

/** 저장소 대역: 무엇을 올리고 지웠는지 기억한다. */
class MemoryStorage implements MediaStorage {
  readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();
  readonly deleted: string[] = [];
  puts = 0;
  failPuts = false;

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    if (this.failPuts) throw new Error('storage down');
    this.puts += 1;
    this.objects.set(key, { bytes, contentType });
  }
  async delete(key: string): Promise<void> {
    this.deleted.push(key);
    this.objects.delete(key);
  }
  publicUrl(key: string): string {
    return `https://media.test/${key}`;
  }
}

const MB = 1024 * 1024;

describe('방 배너·로고', () => {
  let app: FastifyInstance;
  let storage: MemoryStorage;
  let host: TestSession;
  let roomId: string;

  const upload = (
    who: TestSession,
    slot: string,
    bytes: Buffer,
    options: { key?: string; room?: string; type?: string; filename?: string } = {},
  ): Promise<LightMyRequestResponse> => {
    const { body, contentType } = multipart(bytes, { type: options.type, filename: options.filename });
    return app.inject({
      method: 'PUT',
      url: `/study-rooms/${options.room ?? roomId}/images/${slot}`,
      headers: { ...authHeaders(who), 'content-type': contentType, 'idempotency-key': options.key ?? randomUUID() },
      payload: body,
    });
  };
  const removeImage = (who: TestSession, slot: string) =>
    app.inject({ method: 'DELETE', url: `/study-rooms/${roomId}/images/${slot}`, headers: withKey(who) });
  const detail = async (who: TestSession) =>
    (await app.inject({ method: 'GET', url: `/study-rooms/${roomId}`, headers: authHeaders(who) })).json().data;

  beforeAll(async () => {
    storage = new MemoryStorage();
    app = await createTestApp({ media: storage });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    storage.objects.clear();
    storage.deleted.length = 0;
    storage.puts = 0;
    storage.failPuts = false;
    host = await startAnonymous(app);
    const res = await app.inject({
      method: 'POST',
      url: '/study-rooms',
      headers: withKey(host),
      payload: JSON.stringify({ name: '사진 방', map: 'cafe', capacity: 10, tag_ids: [], password: 'Study1' }),
    });
    roomId = res.json().data.room.id;
  });

  it('방장이 올리면 절대 URL과 새 id가 생기고, 형식은 파일 앞부분으로 정한다', async () => {
    const res = await upload(host, 'banner', webp(), { type: 'image/png', filename: 'a.png' });
    expect(res.statusCode).toBe(200);
    expectContract('/study-rooms/{room_id}/images/{slot}', 'put', 200, res.json());
    const banner = res.json().data.room.banner;
    expect(banner.url).toBe(`https://media.test/rooms/${roomId}/banner/${banner.id}`);
    expect(storage.objects.get(`rooms/${roomId}/banner/${banner.id}`)?.contentType).toBe('image/webp');
    expect(res.json().data.password).toBe('Study1');

    const logo = await upload(host, 'logo', jpeg());
    expect(logo.json().data.room.logo.url).toMatch(new RegExp(`^https://media\\.test/rooms/${roomId}/logo/`));
    const seen = await detail(host);
    expect(seen.room.banner).toEqual(banner);

    const list = await app.inject({ method: 'GET', url: '/study-rooms?scope=all', headers: authHeaders(host) });
    expect(list.json().data.rooms[0].banner).toEqual(banner);
  });

  it('바꾸면 id·URL이 바뀌고 이전 파일을 지운다', async () => {
    const first = (await upload(host, 'banner', PNG_1X1)).json().data.room.banner;
    const second = (await upload(host, 'banner', jpeg())).json().data.room.banner;
    expect(second.id).not.toBe(first.id);
    expect(storage.deleted).toEqual([`rooms/${roomId}/banner/${first.id}`]);
    expect([...storage.objects.keys()]).toEqual([`rooms/${roomId}/banner/${second.id}`]);
  });

  it('지우면 null이 되고 파일도 지운다. 이미 없으면 그대로 성공', async () => {
    const logo = (await upload(host, 'logo', PNG_1X1)).json().data.room.logo;
    const res = await removeImage(host, 'logo');
    expect(res.statusCode).toBe(200);
    expectContract('/study-rooms/{room_id}/images/{slot}', 'delete', 200, res.json());
    expect(res.json().data.room.logo).toBeNull();
    expect(storage.deleted).toEqual([`rooms/${roomId}/logo/${logo.id}`]);
    expect((await removeImage(host, 'logo')).statusCode).toBe(200);
  });

  it('방장만 올리고 지운다(멤버·남은 403), 없는 방은 404, 아무것도 저장하지 않는다', async () => {
    const member = await startAnonymous(app);
    await app.inject({ method: 'POST', url: `/study-rooms/${roomId}/join`, headers: withKey(member), payload: '{"password":"Study1"}' });
    const outsider = await startAnonymous(app);
    for (const who of [member, outsider]) {
      const res = await upload(who, 'banner', PNG_1X1);
      expect(res.statusCode).toBe(403);
      expectContract('/study-rooms/{room_id}/images/{slot}', 'put', 403, res.json());
      expect(res.json().error.code).toBe('STUDY_ROOM_HOST_ONLY');
      expect((await removeImage(who, 'banner')).statusCode).toBe(403);
    }
    expect((await upload(host, 'banner', PNG_1X1, { room: randomUUID() })).statusCode).toBe(404);
    expect(storage.puts).toBe(0);
  });

  it('PNG·JPEG·WebP가 아니면(보낸 형식과 무관하게) 422 file', async () => {
    for (const bytes of [Buffer.from('GIF89a\x01\x00\x01\x00'), Buffer.from('<svg/>'), Buffer.from('hello')]) {
      const res = await upload(host, 'banner', bytes, { type: 'image/png' });
      expect(res.statusCode).toBe(422);
      expectContract('/study-rooms/{room_id}/images/{slot}', 'put', 422, res.json());
      expect(res.json().error.details.field).toBe('file');
    }
    expect(storage.puts).toBe(0);
  });

  it('file 필드가 없거나 multipart가 아니면 422, 없는 슬롯은 404', async () => {
    const { body, contentType } = multipart(PNG_1X1, { field: 'photo' });
    const noField = await app.inject({
      method: 'PUT',
      url: `/study-rooms/${roomId}/images/banner`,
      headers: { ...authHeaders(host), 'content-type': contentType, 'idempotency-key': randomUUID() },
      payload: body,
    });
    expect(noField.statusCode).toBe(422);
    const json = await app.inject({ method: 'PUT', url: `/study-rooms/${roomId}/images/banner`, headers: withKey(host), payload: '{}' });
    expect(json.statusCode).toBe(422);
    expect((await upload(host, 'cover', PNG_1X1)).statusCode).toBe(404);
  });

  it('10MB를 넘는 파일은 422, 요청이 11MB를 넘으면 413', async () => {
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(10 * MB + 1 - PNG_1X1.length)]);
    const tooBig = await upload(host, 'banner', big);
    expect(tooBig.statusCode).toBe(422);
    expect(tooBig.json().error.details.field).toBe('file');

    const huge = await upload(host, 'banner', Buffer.concat([PNG_1X1, Buffer.alloc(11 * MB)]));
    expect(huge.statusCode).toBe(413);
    expectContract('/study-rooms/{room_id}/images/{slot}', 'put', 413, huge.json());

    const fine = await upload(host, 'banner', Buffer.concat([PNG_1X1, Buffer.alloc(10 * MB - PNG_1X1.length)]));
    expect(fine.statusCode).toBe(200);
  });

  it('같은 키 재전송은 한 번만 올리고(경계 문자열이 달라도) 기록에 비밀번호를 남기지 않는다', async () => {
    const key = randomUUID();
    const first = await upload(host, 'banner', PNG_1X1, { key });
    const again = await upload(host, 'banner', PNG_1X1, { key });
    expect(again.statusCode).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.json().data.room.banner).toEqual(first.json().data.room.banner);
    expect(again.json().data.password).toBeNull();
    expect(storage.puts).toBe(1);
  });

  it('저장소가 실패하면 방은 그대로다', async () => {
    storage.failPuts = true;
    const res = await upload(host, 'banner', PNG_1X1);
    expect(res.statusCode).toBe(500);
    expect((await detail(host)).room.banner).toBeNull();
  });

  it('방을 지우거나 방장이 나가거나 계정을 지우면 사진도 지운다', async () => {
    const keysOf = () => [...storage.objects.keys()];
    await upload(host, 'banner', PNG_1X1);
    await upload(host, 'logo', PNG_1X1);
    expect(keysOf()).toHaveLength(2);
    await app.inject({ method: 'DELETE', url: `/study-rooms/${roomId}`, headers: withKey(host) });
    expect(keysOf()).toEqual([]);

    const makeRoom = async (who: TestSession) =>
      (
        await app.inject({
          method: 'POST',
          url: '/study-rooms',
          headers: withKey(who),
          payload: JSON.stringify({ name: '두 번째', map: 'cafe', capacity: 10, tag_ids: [] }),
        })
      ).json().data.room.id as string;

    roomId = await makeRoom(host);
    await upload(host, 'banner', PNG_1X1);
    await app.inject({ method: 'POST', url: `/study-rooms/${roomId}/leave`, headers: withKey(host) });
    expect(keysOf()).toEqual([]);

    roomId = await makeRoom(host);
    await upload(host, 'logo', PNG_1X1);
    await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(host) });
    expect(keysOf()).toEqual([]);
  });
});

describe('디스크 저장소로 개발 서버가 직접 내준다', () => {
  let app: FastifyInstance;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sv-media-app-'));
    app = await createTestApp({ env: { MEDIA_STORAGE: 'disk', MEDIA_DIR: dir, MEDIA_PUBLIC_BASE_URL: 'http://localhost:5191/media' } });
  });
  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('올린 파일을 /media 아래에서 긴 캐시로 내주고, 지우면 파일도 없다', async () => {
    await resetDatabase(app);
    const host = await startAnonymous(app);
    const created = await app.inject({
      method: 'POST',
      url: '/study-rooms',
      headers: withKey(host),
      payload: JSON.stringify({ name: '디스크 방', map: 'cafe', capacity: 10, tag_ids: [] }),
    });
    const id = created.json().data.room.id;
    const { body, contentType } = multipart(PNG_1X1);
    const res = await app.inject({
      method: 'PUT',
      url: `/study-rooms/${id}/images/logo`,
      headers: { ...authHeaders(host), 'content-type': contentType, 'idempotency-key': randomUUID() },
      payload: body,
    });
    const url = new URL(res.json().data.room.logo.url);
    expect(url.origin).toBe('http://localhost:5191');

    const served = await app.inject({ method: 'GET', url: url.pathname });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(served.rawPayload.equals(PNG_1X1)).toBe(true);

    expect((await app.inject({ method: 'GET', url: '/media/../../package.json' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/media/rooms/x/logo/y' })).statusCode).toBe(404);

    await app.inject({ method: 'DELETE', url: `/study-rooms/${id}`, headers: withKey(host) });
    expect((await app.inject({ method: 'GET', url: url.pathname })).statusCode).toBe(404);
    expect(await readdir(join(dir, 'rooms', id, 'logo'))).toEqual([]);
  });
});
