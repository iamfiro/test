import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { createMediaStorage } from './media/factory.js';
import { LeagueService } from './league/service.js';
import { runCli } from './ops/commands.js';
import { moveRoomTagRefs, RoomService } from './rooms/service.js';

// 운영 CLI: `npm run cli -- <명령>`(개발) 또는 `node --env-file-if-exists=.env dist/cli.js <명령>`(운영 호스트).
// 서버와 같은 환경 변수를 읽는다(리그 상수·방 정리에 필요한 미디어 저장소). 결과는 표준 출력, 오류·사용법은 표준 오류로
// 낸다(서버 로그가 아니라 사람이 읽는 출력).
let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
const handle = createDb(config.database);
const now = () => new Date();
const media = createMediaStorage(config);
const err = (line: string) => process.stderr.write(`${line}\n`);
try {
  process.exitCode = await runCli(process.argv.slice(2), {
    db: handle.db,
    moveTagRefs: moveRoomTagRefs,
    now,
    league: new LeagueService(handle.db, now, config.league, config.entryIdSecret),
    rooms: new RoomService(handle.db, now, media, { passwordKey: config.roomPasswordKey, createPerIpPerDay: config.roomCreatePerIpPerDay }, {
      // CLI는 서버와 다른 프로세스라 열린 소켓에 알릴 곳이 없다(방 변경은 그 방에 다시 들어올 때 보인다).
      onListenerError: (error) => err(`room change listener failed: ${error instanceof Error ? error.message : String(error)}`),
      onMediaDeleteError: (key, error) => err(`media delete failed key: ${key} ${error instanceof Error ? error.message : String(error)}`),
    }),
    out: (line) => process.stdout.write(`${line}\n`),
    err,
  });
} finally {
  await handle.pool.end();
}
