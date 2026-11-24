import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // 모든 테스트가 같은 테스트 DB를 쓰므로 파일을 하나씩 돌린다(테이블 비우기 격리).
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
