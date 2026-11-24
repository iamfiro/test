import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { encodeKey, type MediaStorage } from './storage.js';

/** 로컬·테스트용: `dir/<key>`에 파일로 둔다. 개발 서버가 `/media/*`로 내준다(`MEDIA_PUBLIC_BASE_URL`). */
export class DiskStorage implements MediaStorage {
  private readonly root: string;

  constructor(
    dir: string,
    private readonly publicBaseUrl: string,
  ) {
    this.root = resolve(dir);
  }

  /** 키가 root 밖을 가리키면 null(경로 조작을 막는다). */
  pathOf(key: string): string | null {
    const path = resolve(join(this.root, key));
    return path.startsWith(this.root + sep) ? path : null;
  }

  // 형식은 내줄 때 파일 앞부분으로 다시 정한다(디스크에 따로 두지 않는다).
  async put(key: string, bytes: Buffer, _contentType: string): Promise<void> {
    const path = this.pathOf(key);
    if (!path) throw new Error('잘못된 미디어 키');
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(temp, bytes);
    await rename(temp, path);
  }

  async delete(key: string): Promise<void> {
    const path = this.pathOf(key);
    if (path) await rm(path, { force: true });
  }

  async read(key: string): Promise<Buffer | null> {
    const path = this.pathOf(key);
    if (!path) return null;
    try {
      return await readFile(path);
    } catch {
      return null;
    }
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${encodeKey(key)}`;
  }
}
