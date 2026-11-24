import { describe, expect, it } from 'vitest';
import { createDb, poolOptions } from '../src/db/client.js';
import { TEST_DATABASE_URL } from './helpers/env.js';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUTEST\n-----END CERTIFICATE-----\n';

describe('DB 연결 TLS', () => {
  it('CA가 있으면 그 CA로만 서버 인증서를 검증한다(rejectUnauthorized), 없으면 TLS 없음', () => {
    expect(poolOptions({ url: TEST_DATABASE_URL, caCert: PEM }).ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
    expect(poolOptions({ url: TEST_DATABASE_URL, caCert: null }).ssl).toBe(false);
  });

  it('CA를 주면 TLS를 받지 않는 DB(로컬 docker)에는 평문으로 붙지 않고 실패한다', async () => {
    const handle = createDb({ url: TEST_DATABASE_URL, caCert: PEM });
    try {
      await expect(handle.pool.query('select 1')).rejects.toThrow(/SSL/i);
    } finally {
      await handle.pool.end();
    }
  });
});
