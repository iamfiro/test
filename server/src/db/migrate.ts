import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { loadDatabaseConfig, type DatabaseConfig } from '../config.js';
import { poolOptions } from './client.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** `server/drizzle/`의 마이그레이션을 순서대로 적용한다. 앞으로만 간다. */
export async function runMigrations(database: DatabaseConfig): Promise<void> {
  const pool = new pg.Pool({ ...poolOptions(database), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

// `npm run db:migrate`(개발) 또는 `node dist/db/migrate.js`(운영). DATABASE_URL·DATABASE_CA_CERT·NODE_ENV만 읽고 서버와 같은
// TLS 규칙을 따른다(운영은 CA 필수). 결과는 표준 출력·오류로 낸다(서버 로거가 없는 일회성 명령).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let database: DatabaseConfig;
  try {
    database = loadDatabaseConfig(process.env);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
  const startedAt = Date.now();
  await runMigrations(database);
  process.stdout.write(`migrations applied elapsed_ms: ${Date.now() - startedAt}\n`);
}
