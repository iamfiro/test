import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const originList = z
  .string()
  .min(1)
  .transform((value) => value.split(',').map((item) => item.trim()))
  .pipe(
    z.array(
      z.string().refine((item) => {
        try {
          const url = new URL(item);
          return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === item;
        } catch {
          return false;
        }
      }, 'origin(스킴+호스트[:포트], 경로 없음)이어야 한다'),
    ),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5191),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: originList,
  DEV_LOGIN_ENABLED: booleanString.default(false),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional(),
  TRUST_PROXY: booleanString.default(false),
  ACCOUNT_CREATE_PER_IP_PER_HOUR: z.coerce.number().int().min(1).default(30),
  REPORT_HIDE_THRESHOLD: z.coerce.number().int().min(1).default(3),
  SETTINGS_CACHE_MS: z.coerce.number().int().min(0).default(5000),
});

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  webOrigins: string[];
  devLoginEnabled: boolean;
  logLevel: string;
  trustProxy: boolean;
  /** IP 하나가 한 시간에 새로 만들 수 있는 익명 계정 수. 이동통신 공유 IP를 감안해 넉넉히 둔다. */
  accountCreatePerIpPerHour: number;
  /** 같은 내용에 대한 서로 다른 사람의 미처리 신고가 이 수에 닿으면 바로 처리한다(메시지 숨김·닉네임 되돌리기). */
  reportHideThreshold: number;
  /** 운영 설정(긴급 스위치)을 메모리에 두는 시간. CLI로 바꾼 값이 이 시간 안에 모든 서버에 적용된다. */
  settingsCacheMs: number;
}

export type Env = Record<string, string | undefined>;

/** 환경 변수를 검증한다. 빠졌거나 잘못됐으면 어느 변수인지 밝히고 던진다(시작 거부). */
export function loadConfig(env: Env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
    throw new Error(`환경 변수가 올바르지 않다: ${detail}`);
  }
  const value = parsed.data;
  if (value.NODE_ENV === 'production' && value.DEV_LOGIN_ENABLED) {
    throw new Error('운영(NODE_ENV=production)에서는 DEV_LOGIN_ENABLED=true로 시작할 수 없다');
  }
  return {
    env: value.NODE_ENV,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    webOrigins: value.WEB_ORIGIN,
    devLoginEnabled: value.DEV_LOGIN_ENABLED,
    logLevel: value.LOG_LEVEL ?? (value.NODE_ENV === 'production' ? 'warn' : 'info'),
    trustProxy: value.TRUST_PROXY,
    accountCreatePerIpPerHour: value.ACCOUNT_CREATE_PER_IP_PER_HOUR,
    reportHideThreshold: value.REPORT_HIDE_THRESHOLD,
    settingsCacheMs: value.SETTINGS_CACHE_MS,
  };
}
