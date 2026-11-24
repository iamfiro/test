import { randomInt } from 'node:crypto';
import type { AvatarValue } from '../db/schema.js';

/** 값 목록의 순서는 계약(PocketTime Friends.Avatar와 같음). */
export const AVATAR_VALUES = {
  shape: ['circle', 'squircle', 'cloud', 'heart', 'flower', 'bow', 'star', 'triangle', 'burst', 'bubble', 'drop', 'arch'],
  color: ['orange', 'tangerine', 'yellow', 'mint', 'blue', 'purple', 'pink', 'red', 'green', 'sky'],
  eyes: ['googly', 'dot', 'happy', 'closed', 'wink', 'sparkle', 'sleepy', 'side'],
  mouth: ['smile', 'grin', 'small', 'tongue', 'open', 'flat', 'kiss', 'smirk'],
  accessory: ['none', 'blush', 'tuft', 'sprout', 'ribbon', 'crown', 'glasses', 'sunglasses'],
} as const satisfies Record<keyof AvatarValue, readonly string[]>;

const KEYS = Object.keys(AVATAR_VALUES) as (keyof AvatarValue)[];

const pick = <T>(list: readonly T[]): T => list[randomInt(list.length)] as T;

export function randomAvatar(): AvatarValue {
  return Object.fromEntries(KEYS.map((key) => [key, pick(AVATAR_VALUES[key])])) as unknown as AvatarValue;
}

/** 캐릭터 값이 계약의 다섯 항목을 모두 갖고 모두 허용 목록에 있으면 그 값을, 아니면 null. */
export function parseAvatar(value: unknown): AvatarValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== KEYS.length) return null;
  const result: Record<string, string> = {};
  for (const key of KEYS) {
    const item = record[key];
    if (typeof item !== 'string' || !(AVATAR_VALUES[key] as readonly string[]).includes(item)) return null;
    result[key] = item;
  }
  return result as unknown as AvatarValue;
}
