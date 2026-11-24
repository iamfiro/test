import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
}

export function createDb(databaseUrl: string): DbHandle {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 3000 });
  // 유휴 연결 오류가 프로세스를 죽이지 않게 한다. 다음 쿼리에서 새 연결을 맺는다.
  pool.on('error', () => {});
  return { db: drizzle(pool, { schema }), pool };
}
