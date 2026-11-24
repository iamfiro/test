export const TEST_DATABASE_URL = 'postgres://studyvillage:studyvillage@localhost:55432/studyvillage_test';
export const TEST_WEB_ORIGIN = 'http://localhost:5190';
/** 테스트 전용 방 비밀번호 암호화 키(32바이트). 운영 키가 아니다. */
export const TEST_ROOM_PASSWORD_KEY = Buffer.alloc(32, 7).toString('base64');
/** 테스트 미디어(디스크) 위치. 프로세스마다 따로 둔다. */
export const TEST_MEDIA_DIR = `${process.env.TMPDIR ?? '/tmp'}/studyvillage-test-media-${process.pid}`;
/** 테스트 전용 리그 항목 id 키. 운영 키가 아니다. */
export const TEST_ENTRY_ID_HMAC_SECRET = 'test-entry-id-hmac-secret-0123456789abcdef';
