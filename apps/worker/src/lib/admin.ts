import { ADMIN_ERROR_MESSAGE_MAX_LENGTH } from "@hearth/shared";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { createAuth } from "../auth";
import { createDb } from "../db/client";
import { errorEvents } from "../db/schema";
import type { Env } from "../env";
import type { AppEnv } from "../types";
import { apiError } from "./responses";
import { nowDate, toUnixSeconds } from "./time";

/**
 * Admin allowlist (docs/specs/M7.md). Emails are compared case-insensitively
 * and the gate fails closed: an unset binding means nobody is an admin.
 */
export function parseAdminEmails(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export function isAdminEmail(env: Pick<Env, "ADMIN_EMAILS">, email: string): boolean {
  return parseAdminEmails(env.ADMIN_EMAILS).has(email.trim().toLowerCase());
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** OTPs, session tokens and keys: long unbroken base64url-ish runs. */
const TOKEN_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;

/**
 * Error messages can echo addresses (auth, email) or tokens. The console only
 * needs enough to recognise the failure, so collapse whitespace, redact those
 * shapes, then cap the length.
 */
export function scrubErrorMessage(message: string): string {
  return message
    .replace(/\s+/g, " ")
    .trim()
    .replace(EMAIL_PATTERN, "[email]")
    .replace(TOKEN_PATTERN, "[redacted]")
    .slice(0, ADMIN_ERROR_MESSAGE_MAX_LENGTH);
}

/**
 * Persist one scrubbed row per unhandled request error. Never throws: the
 * caller is already failing the request and the console must not add a second
 * failure path. The insert is awaited off the response via waitUntil.
 */
export function recordErrorEvent(env: Env, c: Context<AppEnv>, error: Error): void {
  const insert = createDb(env.DB)
    .insert(errorEvents)
    .values({
      id: crypto.randomUUID(),
      createdAt: toUnixSeconds(nowDate()),
      requestId: c.get("requestId") ?? null,
      method: c.req.method,
      route: c.req.path,
      status: 500,
      errorName: error.name || "Error",
      message: scrubErrorMessage(error.message),
    })
    .then(() => undefined)
    .catch(() => undefined);

  try {
    c.executionCtx.waitUntil(insert);
  } catch {
    // No execution context (direct handler invocation in tests): drop it.
  }
}

/**
 * Admin guard. Deliberately identical to the router's notFound body: a
 * signed-out or non-allowlisted caller cannot tell admin routes exist.
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const auth = createAuth(c.env);
  const result = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!result || !isAdminEmail(c.env, result.user.email)) {
    return apiError(c, 404, "not_found", "The requested resource was not found.");
  }

  c.set("user", result.user);
  c.set("session", result.session);

  await next();
});
