import type { Config } from '../config.js';
import { DiskStorage } from './disk.js';
import { R2Storage } from './r2.js';
import type { MediaStorage } from './storage.js';

/** 설정(`MEDIA_STORAGE`)대로 미디어 저장소를 만든다(서버·CLI 공통). */
export function createMediaStorage(config: Config): MediaStorage {
  const media = config.media;
  if (media.storage === 'r2') return new R2Storage(media);
  return new DiskStorage(media.dir, media.publicBaseUrl);
}
