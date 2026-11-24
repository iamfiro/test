import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  WEB_ORIGIN: 'http://localhost:5190',
  ROOM_PASSWORD_KEY: Buffer.alloc(32, 1).toString('base64'),
  MEDIA_PUBLIC_BASE_URL: 'https://media.example.test',
  ENTRY_ID_HMAC_SECRET: 'x'.repeat(32),
};
/** 모양만 맞춘 PEM(검증 대상이 아니라 설정 검사용). 운영 CA가 아니다. */
const TEST_PEM = '-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUTEST\n-----END CERTIFICATE-----\n';
const r2 = {
  DATABASE_CA_CERT: TEST_PEM,
  MEDIA_STORAGE: 'r2',
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
};

describe('설정 검증', () => {
  it('DATABASE_URL이 없으면 시작하지 않는다', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', WEB_ORIGIN: base.WEB_ORIGIN })).toThrow(/DATABASE_URL/);
  });

  it('WEB_ORIGIN이 없으면 시작하지 않는다', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', DATABASE_URL: base.DATABASE_URL })).toThrow(/WEB_ORIGIN/);
  });

  it('운영에서 개발 로그인이 켜져 있으면 시작하지 않는다', () => {
    expect(() =>
      loadConfig({ ...base, ...r2, NODE_ENV: 'production', DEV_LOGIN_ENABLED: 'true' }),
    ).toThrow(/DEV_LOGIN_ENABLED/);
  });

  it('운영에서 개발 로그인이 꺼져 있거나 없으면 시작한다', () => {
    expect(loadConfig({ ...base, ...r2, NODE_ENV: 'production' }).devLoginEnabled).toBe(false);
    expect(loadConfig({ ...base, ...r2, NODE_ENV: 'production', DEV_LOGIN_ENABLED: 'false' }).devLoginEnabled).toBe(false);
  });

  it('개발에서는 개발 로그인을 켤 수 있다', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true' }).devLoginEnabled).toBe(true);
  });

  it('true·false가 아닌 불리언 값은 거절한다', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'yes' })).toThrow(/DEV_LOGIN_ENABLED/);
  });

  it('WEB_ORIGIN은 쉼표로 여러 개를 받고 경로가 있으면 거절한다', () => {
    expect(
      loadConfig({ ...base, NODE_ENV: 'development', WEB_ORIGIN: 'http://a.test,https://b.test', INVITE_WEB_ORIGIN: 'https://b.test' })
        .webOrigins,
    ).toEqual([
      'http://a.test',
      'https://b.test',
    ]);
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', WEB_ORIGIN: 'http://a.test/x' })).toThrow(/WEB_ORIGIN/);
  });

  it('방 비밀번호 키가 없거나 32바이트가 아니면 시작하지 않는다', () => {
    const { ROOM_PASSWORD_KEY: _omit, ...noKey } = base;
    expect(() => loadConfig({ ...noKey, NODE_ENV: 'development' })).toThrow(/ROOM_PASSWORD_KEY/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', ROOM_PASSWORD_KEY: 'c2hvcnQ=' })).toThrow(/ROOM_PASSWORD_KEY/);
  });

  it('초대 링크 웹 주소: WEB_ORIGIN이 하나면 그것, 여럿이면 INVITE_WEB_ORIGIN이 있어야 한다', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'development' }).inviteWebOrigin).toBe('http://localhost:5190');
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', WEB_ORIGIN: 'http://a.test,https://b.test' })).toThrow(
      /INVITE_WEB_ORIGIN/,
    );
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', INVITE_WEB_ORIGIN: 'https://a.test/r' })).toThrow(/INVITE_WEB_ORIGIN/);
  });

  it('미디어: 기준 URL이 필요하고, 운영은 R2만, R2는 키 네 개가 모두 있어야 한다', () => {
    const { MEDIA_PUBLIC_BASE_URL: _omit, ...noBase } = base;
    expect(() => loadConfig({ ...noBase, NODE_ENV: 'development' })).toThrow(/MEDIA_PUBLIC_BASE_URL/);
    expect(loadConfig({ ...base, NODE_ENV: 'development', MEDIA_PUBLIC_BASE_URL: 'http://localhost:5191/media/' }).media).toMatchObject({
      storage: 'disk',
      publicBaseUrl: 'http://localhost:5191/media',
    });
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', DATABASE_CA_CERT: TEST_PEM })).toThrow(/MEDIA_STORAGE/);
    const { R2_BUCKET: _bucket, ...noBucket } = r2;
    expect(() => loadConfig({ ...base, ...noBucket, NODE_ENV: 'production' })).toThrow(/R2_BUCKET/);
    expect(loadConfig({ ...base, ...r2, NODE_ENV: 'production' }).media).toMatchObject({ storage: 'r2', bucket: 'bucket' });
  });

  it('리그: 항목 id 키는 32자 이상 필수, 상수는 초 단위 환경 변수(기본 7시간·3시간 30분·10분)', () => {
    const { ENTRY_ID_HMAC_SECRET: _omit, ...noSecret } = base;
    expect(() => loadConfig({ ...noSecret, NODE_ENV: 'development' })).toThrow(/ENTRY_ID_HMAC_SECRET/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', ENTRY_ID_HMAC_SECRET: 'short' })).toThrow(/ENTRY_ID_HMAC_SECRET/);
    expect(loadConfig({ ...base, NODE_ENV: 'development' }).league).toEqual({
      promoteMinSeconds: 25_200,
      stayMinSeconds: 12_600,
      settleDelayMs: 600_000,
    });
    expect(
      loadConfig({ ...base, NODE_ENV: 'development', LEAGUE_PROMOTE_MIN: '3600', LEAGUE_STAY_MIN: '60', LEAGUE_SETTLE_DELAY: '0' }).league,
    ).toEqual({ promoteMinSeconds: 3600, stayMinSeconds: 60, settleDelayMs: 0 });
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', LEAGUE_PROMOTE_MIN: '7h' })).toThrow(/LEAGUE_PROMOTE_MIN/);
  });

  it('DB TLS: DATABASE_CA_CERT(PEM 문자열)가 있으면 CA 검증 TLS, 운영은 필수, 연결 문자열의 ssl 매개변수는 거부', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'development' }).database).toEqual({ url: base.DATABASE_URL, caCert: null });
    expect(loadConfig({ ...base, NODE_ENV: 'development', DATABASE_CA_CERT: TEST_PEM }).database).toEqual({
      url: base.DATABASE_URL,
      caCert: TEST_PEM,
    });
    const { DATABASE_CA_CERT: _omit, ...r2WithoutCa } = r2;
    expect(() => loadConfig({ ...base, ...r2WithoutCa, NODE_ENV: 'production' })).toThrow(/DATABASE_CA_CERT/);
    // 파일 경로나 줄바꿈이 `\n` 글자로 들어간 값은 받지 않는다.
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', DATABASE_CA_CERT: '/etc/ssl/supabase.crt' })).toThrow(/DATABASE_CA_CERT/);
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'development', DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\\nAAAA\\n-----END CERTIFICATE-----' }),
    ).toThrow(/DATABASE_CA_CERT/);
    for (const query of ['sslmode=require', 'sslrootcert=/x.crt', 'ssl=true']) {
      expect(() => loadConfig({ ...base, NODE_ENV: 'development', DATABASE_URL: `${base.DATABASE_URL}?${query}` })).toThrow(/DATABASE_URL/);
    }
  });
});
