import type { Db } from '../db/client.js';
import { appSettings } from '../db/schema.js';

/**
 * 긴급 스위치. 기본값은 모두 켜짐이다: 행이 없는(설정을 한 번도 바꾸지 않은) DB에서 서비스가 정상으로 돌아야
 * 하기 때문이다. 끄는 것만 운영자가 CLI로 명시한다.
 */
export const SETTINGS = {
  /** 채팅 쓰기(L5가 읽는다). */
  chat_write_enabled: { default: true },
  /** 방 만들기(L4가 읽는다). */
  room_create_enabled: { default: true },
  /** `/auth/start`의 새 익명 계정 생성. 세션이 이미 있는 사람은 막지 않는다. */
  account_create_enabled: { default: true },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type Settings = Record<SettingKey, boolean>;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export const isSettingKey = (value: string): value is SettingKey => Object.hasOwn(SETTINGS, value);

/** 저장된 값을 읽어 기본값 위에 얹는다. 모르는 키나 불리언이 아닌 값은 무시하지 않고 던진다(잘못 넣은 값을 드러낸다). */
export async function readSettings(db: Db): Promise<Settings> {
  const rows = await db.select().from(appSettings);
  const result = Object.fromEntries(SETTING_KEYS.map((key) => [key, SETTINGS[key].default])) as Settings;
  for (const row of rows) {
    if (!isSettingKey(row.key)) continue; // 다른 단계가 쓰는 키(아직 이 목록에 없는 것)는 여기서 다루지 않는다
    if (typeof row.value !== 'boolean') throw new Error(`설정 ${row.key}의 값이 불리언이 아니다`);
    result[row.key] = row.value;
  }
  return result;
}

/** CLI가 쓰는 저장 함수. `raw`는 `true`·`false`만 받는다. */
export async function writeSetting(db: Db, key: string, raw: string): Promise<{ key: SettingKey; value: boolean }> {
  if (!isSettingKey(key)) throw new Error(`모르는 설정 키: ${key} (가능: ${SETTING_KEYS.join(', ')})`);
  if (raw !== 'true' && raw !== 'false') throw new Error(`설정 값은 true 또는 false여야 한다: ${raw}`);
  const value = raw === 'true';
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return { key, value };
}

/** 서버 프로세스의 설정 캐시. `ttlMs`가 지나면 다음 읽기에서 DB를 다시 읽는다(여러 서버가 같은 값을 곧 따른다). */
export class SettingsService {
  private cached: { value: Settings; at: number } | null = null;

  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
    private readonly ttlMs: number,
  ) {}

  async isEnabled(key: SettingKey): Promise<boolean> {
    return (await this.all())[key];
  }

  async all(): Promise<Settings> {
    const at = this.now().getTime();
    if (this.cached && at - this.cached.at < this.ttlMs) return this.cached.value;
    const value = await readSettings(this.db);
    this.cached = { value, at };
    return value;
  }
}
