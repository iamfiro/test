import type { FastifyInstance } from 'fastify';
import { buildApp, type AppOptions } from '../../src/app.js';
import { loadConfig, type Config } from '../../src/config.js';
import { sql } from 'drizzle-orm';
import { TEST_DATABASE_URL, TEST_ROOM_PASSWORD_KEY, TEST_WEB_ORIGIN } from './env.js';

export function testConfig(overrides: Record<string, string | undefined> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    LOG_LEVEL: 'silent',
    ROOM_PASSWORD_KEY: TEST_ROOM_PASSWORD_KEY,
    ...overrides,
  });
}

export async function createTestApp(
  options: Partial<AppOptions> & { env?: Record<string, string | undefined> } = {},
): Promise<FastifyInstance> {
  const { env, ...rest } = options;
  const app = await buildApp({ config: testConfig(env), ...rest });
  await app.ready();
  return app;
}

/** public 스키마의 모든 테이블을 비운다(마이그레이션 기록 제외). 테스트마다 부른다. */
export async function resetDatabase(app: FastifyInstance): Promise<void> {
  await app.db.execute(sql`
    DO $$
    DECLARE t text;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t);
      END LOOP;
    END $$;
  `);
}
