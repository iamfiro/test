import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { DatabaseConfig } from '../config.js';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

/** `Db`와 트랜잭션 안의 `tx` 모두에서 쓸 수 있는 실행자. */
export type DbExecutor = Pick<Db, 'insert' | 'select' | 'update' | 'delete' | 'execute'>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
}

/**
 * pg 연결 옵션. CA가 있으면 TLS로 붙고 그 CA로 서버 인증서와 호스트 이름을 검증한다(`rejectUnauthorized: true`, 검증 실패면
 * 연결하지 않는다). CA가 없으면(로컬 docker) TLS 없이 붙는다. 서버·CLI·마이그레이션이 같은 옵션을 쓴다.
 */
export function poolOptions(database: DatabaseConfig): pg.PoolConfig {
  return {
    connectionString: database.url,
    ssl: database.caCert === null ? false : { ca: database.caCert, rejectUnauthorized: true },
  };
}

export function createDb(database: DatabaseConfig): DbHandle {
  const pool = new pg.Pool({ ...poolOptions(database), max: 10, connectionTimeoutMillis: 3000 });
  // 유휴 연결 오류가 프로세스를 죽이지 않게 한다. 다음 쿼리에서 새 연결을 맺는다.
  pool.on('error', () => {});
  return { db: drizzle(pool, { schema }), pool };
}
