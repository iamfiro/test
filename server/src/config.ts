import { fileURLToPath } from 'node:url';
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

const baseUrl = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.search === '' && url.hash === '';
    } catch {
      return false;
    }
  }, '절대 http(s) URL(쿼리·조각 없음)이어야 한다')
  .transform((value) => value.replace(/\/+$/, ''));

/** 디스크 미디어 기본 위치: `server/var/media`(src/와 dist/ 모두 같은 상대 경로, git 제외). */
const DEFAULT_MEDIA_DIR = fileURLToPath(new URL('../var/media', import.meta.url));

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
  ROOM_CREATE_PER_IP_PER_DAY: z.coerce.number().int().min(1).default(10),
  ROOM_PASSWORD_KEY: z
    .string()
    .min(1)
    .transform((value) => Buffer.from(value, 'base64'))
    .refine((key) => key.length === 32, '32바이트를 base64로 적어야 한다(`openssl rand -base64 32`)'),
  INVITE_WEB_ORIGIN: originList
    .refine((list) => list.length === 1, 'origin 하나여야 한다')
    .transform((list) => list[0]!)
    .optional(),
  MEDIA_STORAGE: z.enum(['disk', 'r2']).default('disk'),
  MEDIA_PUBLIC_BASE_URL: baseUrl,
  MEDIA_DIR: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  ENTRY_ID_HMAC_SECRET: z.string().min(32, '32자 이상이어야 한다(`openssl rand -base64 32`)'),
  LEAGUE_PROMOTE_MIN: z.coerce.number().int().min(0).default(7 * 3600),
  LEAGUE_STAY_MIN: z.coerce.number().int().min(0).default(3 * 3600 + 30 * 60),
  LEAGUE_SETTLE_DELAY: z.coerce.number().int().min(0).default(600),
});

export type MediaConfig =
  | { storage: 'disk'; publicBaseUrl: string; dir: string }
  | { storage: 'r2'; publicBaseUrl: string; accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

/** 리그 상수(study-league.md §1). 환경 변수 값은 모두 초다. */
export interface LeagueConfig {
  /** 일반 리그 승급 최소 주 점수(`LEAGUE_PROMOTE_MIN`, 기본 7시간). */
  promoteMinSeconds: number;
  /** 카페인 리그 잔류 최소 주 점수(`LEAGUE_STAY_MIN`, 기본 3시간 30분). */
  stayMinSeconds: number;
  /** 주 마감 뒤 정산까지 기다리는 시간(`LEAGUE_SETTLE_DELAY`, 기본 10분. presence 늦음 허용보다 넉넉히). */
  settleDelayMs: number;
}

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
  /** IP 하나가 24시간에 만들 수 있는 공부방 수. 공유 IP(학교·이동통신)를 감안해 넉넉히 둔다. */
  roomCreatePerIpPerDay: number;
  /** 방 비밀번호 암호화 키(AES-256-GCM). 방장이 비밀번호를 다시 읽어야 해서 해시가 아니라 암호화한다(PocketTime과 같음). */
  roomPasswordKey: Buffer;
  /** 초대 링크 `https://<웹>/r#<token>`의 웹 주소. */
  inviteWebOrigin: string;
  /** 미디어 저장소(방 배너·로고). 운영은 R2만. */
  media: MediaConfig;
  /** 리그 순위표 항목 id(HMAC) 키. 사용자 id를 내보내지 않으려고 쓴다. */
  entryIdSecret: string;
  league: LeagueConfig;
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
  // 초대 링크 주소는 웹 주소가 하나뿐일 때만 WEB_ORIGIN에서 정한다. 여럿이면 어느 것인지 추측하지 않고 시작을 거부한다.
  if (value.INVITE_WEB_ORIGIN === undefined && value.WEB_ORIGIN.length !== 1) {
    throw new Error('WEB_ORIGIN이 여러 개면 INVITE_WEB_ORIGIN(초대 링크의 웹 주소)을 정해야 한다');
  }
  let media: MediaConfig;
  if (value.MEDIA_STORAGE === 'r2') {
    const missing = (['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const).filter((name) => !value[name]);
    if (missing.length > 0) throw new Error(`MEDIA_STORAGE=r2에는 ${missing.join(', ')}이(가) 필요하다`);
    media = {
      storage: 'r2',
      publicBaseUrl: value.MEDIA_PUBLIC_BASE_URL,
      accountId: value.R2_ACCOUNT_ID!,
      accessKeyId: value.R2_ACCESS_KEY_ID!,
      secretAccessKey: value.R2_SECRET_ACCESS_KEY!,
      bucket: value.R2_BUCKET!,
    };
  } else {
    // 디스크는 서버 한 대의 로컬 파일이라 운영(재배포·여러 대)에서 사진을 잃는다. 운영은 R2만 받는다.
    if (value.NODE_ENV === 'production') throw new Error('운영(NODE_ENV=production)에서는 MEDIA_STORAGE=r2여야 한다');
    media = { storage: 'disk', publicBaseUrl: value.MEDIA_PUBLIC_BASE_URL, dir: value.MEDIA_DIR ?? DEFAULT_MEDIA_DIR };
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
    roomCreatePerIpPerDay: value.ROOM_CREATE_PER_IP_PER_DAY,
    roomPasswordKey: value.ROOM_PASSWORD_KEY,
    inviteWebOrigin: value.INVITE_WEB_ORIGIN ?? value.WEB_ORIGIN[0]!,
    media,
    entryIdSecret: value.ENTRY_ID_HMAC_SECRET,
    league: {
      promoteMinSeconds: value.LEAGUE_PROMOTE_MIN,
      stayMinSeconds: value.LEAGUE_STAY_MIN,
      settleDelayMs: value.LEAGUE_SETTLE_DELAY * 1000,
    },
  };
}
