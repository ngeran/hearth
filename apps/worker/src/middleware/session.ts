import { ADMIN_PRESENCE_TOUCH_SECONDS } from "@hearth/shared";
import { and, eq, lt } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { createAuth } from "../auth";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { apiError } from "../lib/responses";
import { nowDate, toUnixSeconds } from "../lib/time";
import type { AppEnv } from "../types";

export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const auth = createAuth(c.env);
  const result = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!result) {
    return apiError(c, 401, "unauthorized", "Sign in to continue.");
  }

  c.set("user", result.user);
  c.set("session", result.session);

  // M7 presence (docs/specs/M7.md): the WHERE clause is the throttle — at most
  // one write per user per five minutes, and it never delays the response.
  const now = toUnixSeconds(nowDate());
  c.executionCtx.waitUntil(
    createDb(c.env.DB)
      .update(users)
      .set({ lastSeenAt: now })
      .where(
        and(eq(users.id, result.user.id), lt(users.lastSeenAt, now - ADMIN_PRESENCE_TOUCH_SECONDS)),
      )
      .then(() => undefined)
      .catch(() => undefined),
  );

  await next();
});

/**
 * Cookies are SameSite=Lax, but this blocks forged cross-site writes that reuse
 * a top-level navigation or a permissive browser. Requests without Origin
 * (curl, Worker tests, native clients) pass through.
 */
export const requireSameOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    await next();
    return;
  }

  const requestOrigin = c.req.header("origin");

  if (requestOrigin) {
    const allowed = new Set([
      new URL(c.env.APP_ORIGIN).origin,
      new URL(c.env.BETTER_AUTH_URL ?? c.env.APP_ORIGIN).origin,
    ]);

    if (!allowed.has(requestOrigin)) {
      return apiError(c, 403, "forbidden", "This request came from an unexpected origin.");
    }
  }

  await next();
});
