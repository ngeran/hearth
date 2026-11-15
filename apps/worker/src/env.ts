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
  /** Web Push VAPID (docs/specs/M6.md): public key + subject are non-secret vars. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_SUBJECT?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Test-only: migrations injected by the Cloudflare Vitest pool. */
  TEST_MIGRATIONS?: Array<{ name: string; queries: string[] }>;
}
