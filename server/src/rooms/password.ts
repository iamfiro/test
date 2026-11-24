import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/** 계약 `RoomPassword`: 영문·숫자 4–20자, 대소문자 구분(PocketTime과 같다). */
export const ROOM_PASSWORD = /^[A-Za-z0-9]{4,20}$/;

const VERSION = 'v1';

/**
 * 방 비밀번호를 AES-256-GCM으로 암호화한다. 방장이 상세에서 비밀번호를 다시 읽어야 해서(앱 동작) 해시로는 둘 수 없다
 * (PocketTimeServer도 같은 이유로 되돌릴 수 있게 암호화한다). 저장 형식: `v1:<iv>:<tag>:<암호문>`(base64url).
 */
export function encryptRoomPassword(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join(':');
}

export function decryptRoomPassword(key: Buffer, stored: string): string {
  const [version, iv, tag, body] = stored.split(':');
  if (version !== VERSION || !iv || !tag || body === undefined) throw new Error('알 수 없는 방 비밀번호 저장 형식');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

/** 보낸 비밀번호가 맞는지(길이가 달라도 같은 시간에 가깝게 비교). */
export function roomPasswordMatches(key: Buffer, stored: string, attempt: unknown): boolean {
  if (typeof attempt !== 'string') return false;
  const expected = Buffer.from(decryptRoomPassword(key, stored));
  const given = Buffer.from(attempt);
  if (given.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }
  return timingSafeEqual(given, expected);
}
