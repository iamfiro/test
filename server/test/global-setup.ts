import { runMigrations } from '../src/db/migrate.js';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://studyvillage:studyvillage@localhost:55432/studyvillage';
export const TEST_DB_NAME = 'studyvillage_test';

// 테스트 전용 DB를 새로 만들고 마이그레이션을 적용한다. 개발 DB는 건드리지 않는다.
export default async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }
  const url = new URL(ADMIN_URL);
  url.pathname = `/${TEST_DB_NAME}`;
  await runMigrations({ url: url.toString(), caCert: null });
}
