export const TEST_DATABASE_URL = 'postgres://studyvillage:studyvillage@localhost:55432/studyvillage_test';
export const TEST_WEB_ORIGIN = 'http://localhost:5190';
/** 테스트 전용 방 비밀번호 암호화 키(32바이트). 운영 키가 아니다. */
export const TEST_ROOM_PASSWORD_KEY = Buffer.alloc(32, 7).toString('base64');
