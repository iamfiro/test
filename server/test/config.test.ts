import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  WEB_ORIGIN: 'http://localhost:5190',
  ROOM_PASSWORD_KEY: Buffer.alloc(32, 1).toString('base64'),
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
});
