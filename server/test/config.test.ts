import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  WEB_ORIGIN: 'http://localhost:5190',
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
      loadConfig({ ...base, NODE_ENV: 'production', DEV_LOGIN_ENABLED: 'true' }),
    ).toThrow(/DEV_LOGIN_ENABLED/);
  });

  it('운영에서 개발 로그인이 꺼져 있거나 없으면 시작한다', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).devLoginEnabled).toBe(false);
    expect(loadConfig({ ...base, NODE_ENV: 'production', DEV_LOGIN_ENABLED: 'false' }).devLoginEnabled).toBe(false);
  });

  it('개발에서는 개발 로그인을 켤 수 있다', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true' }).devLoginEnabled).toBe(true);
  });

  it('true·false가 아닌 불리언 값은 거절한다', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'yes' })).toThrow(/DEV_LOGIN_ENABLED/);
  });

  it('WEB_ORIGIN은 쉼표로 여러 개를 받고 경로가 있으면 거절한다', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'development', WEB_ORIGIN: 'http://a.test,https://b.test' }).webOrigins).toEqual([
      'http://a.test',
      'https://b.test',
    ]);
    expect(() => loadConfig({ ...base, NODE_ENV: 'development', WEB_ORIGIN: 'http://a.test/x' })).toThrow(/WEB_ORIGIN/);
  });
});
