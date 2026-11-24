import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DiskStorage } from '../src/media/disk.js';
import { sniffImage } from '../src/media/image.js';
import { parseMultipartFile } from '../src/media/multipart.js';
import { R2Storage, signV4 } from '../src/media/r2.js';
import { jpeg, multipart, PNG_1X1, webp } from './helpers/images.js';

describe('이미지 형식 확인(매직 바이트·머리)', () => {
  it('PNG·JPEG·WebP의 형식과 가로세로를 읽는다', () => {
    expect(sniffImage(PNG_1X1)).toEqual({ type: 'image/png', width: 1, height: 1 });
    expect(sniffImage(jpeg(640, 480))).toEqual({ type: 'image/jpeg', width: 640, height: 480 });
    expect(sniffImage(webp(1200, 400))).toEqual({ type: 'image/webp', width: 1200, height: 400 });
  });

  it('형식이 다르거나 머리가 깨졌으면 null', () => {
    expect(sniffImage(Buffer.from('GIF89a......'))).toBeNull();
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImage(PNG_1X1.subarray(0, 20))).toBeNull(); // IHDR가 잘림
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBeNull(); // SOF 전에 SOS
    expect(sniffImage(webp().subarray(0, 20))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('multipart 파싱', () => {
  it('file 필드의 바이트를 그대로 꺼낸다', () => {
    const bytes = Buffer.concat([PNG_1X1, Buffer.from('\r\n--not-a-boundary\r\n')]);
    const { body, contentType } = multipart(bytes);
    const file = parseMultipartFile(body, contentType, 'file');
    expect(file?.equals(bytes)).toBe(true);
  });

  it('필드가 없거나 경계가 없으면 null', () => {
    const { body, contentType } = multipart(PNG_1X1, { field: 'photo' });
    expect(parseMultipartFile(body, contentType, 'file')).toBeNull();
    expect(parseMultipartFile(body, 'multipart/form-data', 'file')).toBeNull();
    expect(parseMultipartFile(Buffer.from('garbage'), 'multipart/form-data; boundary=x', 'file')).toBeNull();
  });
});

describe('R2(S3 호환) 어댑터 — 실제 호출 없이 대역으로', () => {
  it('SigV4 서명이 AWS 문서 예시(GET Object)와 같다', () => {
    const headers = signV4({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      headers: { range: 'bytes=0-9' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 's3',
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });

  it('PUT·DELETE를 계정 엔드포인트의 버킷 경로로 서명해 보낸다', async () => {
    const calls: { method: string; url: string; headers: Record<string, string>; body: Buffer | null }[] = [];
    const storage = new R2Storage({
      accountId: 'acc123',
      accessKeyId: 'AKIDTEST',
      secretAccessKey: 'secret',
      bucket: 'studyvillage-media',
      publicBaseUrl: 'https://media.pocket-time.study',
      fetch: async (input, init) => {
        calls.push({
          method: init!.method!,
          url: String(input),
          headers: Object.fromEntries(new Headers(init!.headers).entries()),
          body: init!.body ? Buffer.from(init!.body as Uint8Array) : null,
        });
        return new Response(null, { status: calls.length === 2 ? 404 : 200 });
      },
    });
    const key = 'rooms/5f0c/banner/abc';
    await storage.put(key, PNG_1X1, 'image/png');
    await storage.delete(key); // 이미 없어도(404) 실패가 아니다

    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.url).toBe(`https://acc123.r2.cloudflarestorage.com/studyvillage-media/${key}`);
    expect(calls[0]!.headers['content-type']).toBe('image/png');
    expect(calls[0]!.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(calls[0]!.headers['x-amz-content-sha256']).toBe(createHash('sha256').update(PNG_1X1).digest('hex'));
    expect(calls[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDTEST\/\d{8}\/auto\/s3\/aws4_request, /);
    expect(calls[0]!.body?.equals(PNG_1X1)).toBe(true);
    expect(calls[1]!.method).toBe('DELETE');
    expect(storage.publicUrl(key)).toBe(`https://media.pocket-time.study/${key}`);
  });

  it('R2가 오류로 답하면 던진다(비밀값은 메시지에 없다)', async () => {
    const storage = new R2Storage({
      accountId: 'acc123',
      accessKeyId: 'AKIDTEST',
      secretAccessKey: 'very-secret',
      bucket: 'b',
      publicBaseUrl: 'https://media.example',
      fetch: async () => new Response('denied', { status: 403 }),
    });
    await expect(storage.put('rooms/x/logo/y', PNG_1X1, 'image/png')).rejects.toThrow(/403/);
    await expect(storage.put('rooms/x/logo/y', PNG_1X1, 'image/png')).rejects.not.toThrow(/very-secret/);
  });
});

describe('디스크 어댑터(로컬·테스트)', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sv-media-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('키 경로에 쓰고 지우며, 공개 URL은 기준 URL 뒤에 키를 붙인다', async () => {
    const storage = new DiskStorage(dir, 'http://localhost:5191/media');
    const key = 'rooms/0b1c/logo/ff00';
    await storage.put(key, PNG_1X1, 'image/png');
    expect((await readFile(join(dir, key))).equals(PNG_1X1)).toBe(true);
    expect(storage.publicUrl(key)).toBe('http://localhost:5191/media/rooms/0b1c/logo/ff00');
    await storage.delete(key);
    await expect(stat(join(dir, key))).rejects.toThrow();
    await storage.delete(key); // 없어도 실패가 아니다
  });
});
