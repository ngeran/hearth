import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";

import { createDb } from "./db/client";
import * as schema from "./db/schema";
import type { Env } from "./env";
import { getTestOtp } from "./lib/test-otp";
import { createMailer, signInEmail } from "./mailer";

const OTP_EXPIRY_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_SECONDS = 30 * 24 * 60 * 60;

/**
 * One instance per request. Better Auth keeps only request-scoped state, and
 * this avoids sharing a D1 client or secret across isolates.
 */
export function createAuth(env: Env) {
  if (env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
  }

  const baseURL = env.BETTER_AUTH_URL ?? env.APP_ORIGIN;
  const origin = new URL(baseURL);
  const mailer = createMailer(env);
  const fixedTestOtp = getTestOtp(env);
  const db = createDb(env.DB);

  return betterAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { ...schema, user: schema.users },
    }),
    trustedOrigins: [...new Set([env.APP_ORIGIN, origin.origin])],
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: SESSION_SECONDS,
      updateAge: 24 * 60 * 60,
    },
    rateLimit: {
      enabled: env.ENVIRONMENT !== "test",
      storage: "database",
      window: 60,
      max: 100,
    },
    plugins: [
      emailOTP({
        storeOTP: "hashed",
        otpLength: 6,
        expiresIn: OTP_EXPIRY_SECONDS,
        allowedAttempts: OTP_MAX_ATTEMPTS,
        resendStrategy: "rotate",
        ...(fixedTestOtp
          ? {
              generateOTP: () => fixedTestOtp,
            }
          : {}),
        rateLimit: {
          window: 60,
          max: 5,
        },
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in") {
            throw new Error("This sign-in method is not available.");
          }

          await mailer.send(signInEmail(email, otp));
        },
      }),
      passkey({
        rpID: origin.hostname,
        rpName: "Hearth",
        origin: origin.origin,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
