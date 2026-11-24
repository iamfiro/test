import { createHash, createHmac } from 'node:crypto';
import { encodeKey, IMMUTABLE_CACHE, type MediaStorage } from './storage.js';

const sha256Hex = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data).digest();

export interface SignInput {
  method: string;
  url: URL;
  /** 서명에 넣을 추가 헤더(소문자 이름). host·x-amz-date·x-amz-content-sha256은 여기서 붙인다. */
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  now: Date;
}

/** AWS Signature Version 4(헤더 방식). 보낼 헤더 전체(서명 포함)를 돌려준다. R2는 region `auto`, service `s3`. */
export function signV4(input: SignInput): Record<string, string> {
  const amzDate = input.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(input.headers).map(([k, v]) => [k.toLowerCase(), v.trim()])),
    host: input.url.host,
    'x-amz-content-sha256': input.payloadHash,
    'x-amz-date': amzDate,
  };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const canonical = [
    input.method,
    input.url.pathname,
    '', // 쿼리 없음
    names.map((name) => `${name}:${headers[name]}\n`).join(''),
    signedHeaders,
    input.payloadHash,
  ].join('\n');
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region), input.service), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

export interface R2Options {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** 공개 미디어 도메인(운영 `https://media.pocket-time.study`). */
  publicBaseUrl: string;
  /** 테스트 대역. 없으면 전역 fetch. */
  fetch?: typeof fetch;
  now?: () => Date;
}

const TIMEOUT_MS = 15_000;

/** Cloudflare R2(S3 호환 API)에 서버가 직접 올리고 지운다. 읽기는 공개 도메인으로만 한다. */
export class R2Storage implements MediaStorage {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: R2Options) {
    this.endpoint = `https://${options.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(options.bucket)}`;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private async send(method: 'PUT' | 'DELETE', key: string, body: Buffer | null, extra: Record<string, string>): Promise<Response> {
    const url = new URL(`${this.endpoint}/${encodeKey(key)}`);
    const headers = signV4({
      method,
      url,
      headers: extra,
      payloadHash: sha256Hex(body ?? ''),
      accessKeyId: this.options.accessKeyId,
      secretAccessKey: this.options.secretAccessKey,
      region: 'auto',
      service: 's3',
      now: this.now(),
    });
    delete headers.host; // fetch가 붙인다(서명에는 들어 있다)
    return this.fetchImpl(url, {
      method,
      headers,
      ...(body ? { body: new Uint8Array(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const res = await this.send('PUT', key, bytes, { 'content-type': contentType, 'cache-control': IMMUTABLE_CACHE });
    if (!res.ok) throw new Error(`R2 put failed status: ${res.status}`);
  }

  async delete(key: string): Promise<void> {
    const res = await this.send('DELETE', key, null, {});
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed status: ${res.status}`);
  }

  publicUrl(key: string): string {
    return `${this.options.publicBaseUrl}/${encodeKey(key)}`;
  }
}
