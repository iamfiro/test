/**
 * 미디어 저장소(launch.md L4a). 운영은 R2(S3 호환), 로컬·테스트는 디스크. 키는 내용이 바뀌면 새 키를 쓰므로
 * (`rooms/<room_id>/<slot>/<id>`) 공개 URL을 오래 캐시해도 된다. 업로드는 서버만 한다.
 */
export interface MediaStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  /** 없는 키를 지워도 실패하지 않는다. */
  delete(key: string): Promise<void>;
  /** 응답에 싣는 절대 공개 URL. */
  publicUrl(key: string): string;
}

/** 공개 캐시 헤더(R2 객체 메타데이터, 개발 서버 응답). */
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/** 키의 각 조각을 URL 경로로 쓴다(키는 서버가 만든 안전한 글자뿐이지만 그대로 믿지 않는다). */
export const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');
