import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      PORT: '4001',
      HOST: '127.0.0.1',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://pokero:pokero_dev_only@127.0.0.1:5433/pokero_test?schema=public',
      SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789abcdef',
      TOKEN_PEPPER: 'test-token-pepper-0123456789abcdef',
      PIN_PEPPER: 'test-pin-pepper-0123456789abcdef',
      APP_BASE_URL: 'http://localhost:5173',
      COOKIE_SECURE: 'false',
      EMAIL_VERIFICATION_REQUIRED: 'false',
      SMTP_HOST: '',
      ADMIN_EMAILS: '',
      SEED_DEMO: 'false',
      TRUST_PROXY: 'false',
      RATE_LIMIT_MAX: '10000',
      AUTH_RATE_LIMIT_MAX: '10000',
      SESSION_TTL_DAYS: '30',
    },
  },
});
