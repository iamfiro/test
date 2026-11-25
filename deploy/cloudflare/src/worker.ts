import { Container, getContainer } from '@cloudflare/containers';

/**
 * 서버 1대(launch.md M7)를 Cloudflare Containers로 띄운다. Worker는 모든 요청·웹소켓을 고정 이름의 컨테이너 한 곳으로
 * 넘기기만 하고, 값은 바꾸지 않는다. 비밀값은 `wrangler secret put`으로 넣는다(저장소에 두지 않는다).
 */
export interface Env {
  API: DurableObjectNamespace<ApiContainer>;
  DATABASE_URL: string;
  DATABASE_CA_CERT: string;
  ROOM_PASSWORD_KEY: string;
  ENTRY_ID_HMAC_SECRET: string;
  WEB_ORIGIN: string;
  MEDIA_PUBLIC_BASE_URL: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
}

const INSTANCE_NAME = 'primary';

export class ApiContainer extends Container<Env> {
  defaultPort = 5191;
  // 접속자가 없어도 서버 안의 주기 작업(자리 비움 판정·리그 정산·청소)이 돌아야 하므로 잠들지 않게 두고,
  // 아래 cron이 1분마다 깨운다. 소켓이 열려 있는 동안은 Durable Object가 활성이라 이 값과 상관없이 유지된다.
  sleepAfter = '6h';
  pingEndpoint = 'healthz';

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: 'production',
      PORT: '5191',
      TRUST_PROXY: 'true',
      LOG_LEVEL: 'warn',
      DATABASE_URL: env.DATABASE_URL,
      DATABASE_CA_CERT: env.DATABASE_CA_CERT,
      ROOM_PASSWORD_KEY: env.ROOM_PASSWORD_KEY,
      ENTRY_ID_HMAC_SECRET: env.ENTRY_ID_HMAC_SECRET,
      WEB_ORIGIN: env.WEB_ORIGIN,
      MEDIA_PUBLIC_BASE_URL: env.MEDIA_PUBLIC_BASE_URL,
      MEDIA_STORAGE: 'r2',
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET: env.R2_BUCKET,
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return getContainer(env.API, INSTANCE_NAME).fetch(request);
  },

  /** 컨테이너가 꺼져 있으면 다시 띄우고, 떠 있으면 활성 시간을 갱신한다. */
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const stub = getContainer(env.API, INSTANCE_NAME);
    await stub.startAndWaitForPorts();
  },
} satisfies ExportedHandler<Env>;
