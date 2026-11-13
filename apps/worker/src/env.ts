export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  CHAT: DurableObjectNamespace;
  JOBS: Queue;
  APP_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  ENVIRONMENT?: string;
  AUTH_TEST_OTP?: string;
  /** Test-only: migrations injected by the Cloudflare Vitest pool. */
  TEST_MIGRATIONS?: Array<{ name: string; queries: string[] }>;
}
