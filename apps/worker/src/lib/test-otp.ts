import type { Env } from "../env";

/** Fixed OTPs exist only when the Worker is explicitly running as a test. */
export function getTestOtp(env: Env): string | null {
  if (env.ENVIRONMENT !== "test") {
    return null;
  }

  const otp = env.AUTH_TEST_OTP;

  return otp && /^\d{6}$/.test(otp) ? otp : null;
}
