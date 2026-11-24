import { createDb } from './db/client.js';
import { runCli } from './ops/commands.js';
import { moveRoomTagRefs } from './rooms/service.js';

// 운영 CLI: `npm run cli -- <명령>`(개발) 또는 `node --env-file-if-exists=.env dist/cli.js <명령>`(운영 호스트).
// DATABASE_URL만 쓴다. 결과는 표준 출력, 오류·사용법은 표준 오류로 낸다(서버 로그가 아니라 사람이 읽는 출력).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  process.stderr.write('DATABASE_URL이 없다\n');
  process.exit(2);
}
const handle = createDb(databaseUrl);
try {
  process.exitCode = await runCli(process.argv.slice(2), {
    db: handle.db,
    moveTagRefs: moveRoomTagRefs,
    now: () => new Date(),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  });
} finally {
  await handle.pool.end();
}
