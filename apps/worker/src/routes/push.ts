import { pushDeleteSchema, pushSubscriptionSchema, vapidKeyResponseSchema } from "@hearth/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";

import { createDb } from "../db/client";
import { pushSubscriptions } from "../db/schema";
import { apiError, readJsonBody } from "../lib/responses";
import { requireSession } from "../middleware/session";
import type { AppEnv } from "../types";

/**
 * Push subscription management (docs/specs/M6.md). The browser subscribes
 * itself via pushManager.subscribe and stores the row here; the queue
 * consumer reads these rows when a chat message needs notifying.
 */
const push = new Hono<AppEnv>();

push.use("*", requireSession);

push.get("/key", (c) => {
  const publicKey = c.env.VAPID_PUBLIC_KEY?.trim();
  // Unset VAPID keys are a deployment state, not a client error — the UI shows
  // "not configured yet" instead of failing silently (spec API section).
  if (!publicKey) {
    return apiError(c, 503, "service_unavailable", "Notifications are not configured yet.");
  }
  return c.json(vapidKeyResponseSchema.parse({ publicKey }), 200, {
    "cache-control": "no-store",
  });
});

push.post("/", async (c) => {
  const parsed = pushSubscriptionSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "bad_request",
      parsed.error.issues[0]?.message ?? "Invalid subscription.",
    );
  }

  const db = createDb(c.env.DB);
  const id = c.get("user").id;
  const now = new Date();

  // Upsert on the endpoint natural key. If the same browser re-subscribes or a
  // device changes accounts, the row follows the latest owner — a stale row
  // would deliver someone else's notifications to this device.
  await db
    .insert(pushSubscriptions)
    .values({
      endpoint: parsed.data.endpoint,
      userId: id,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        updatedAt: now,
      },
    });

  return c.body(null, 204, { "cache-control": "no-store" });
});

push.delete("/", async (c) => {
  const parsed = pushDeleteSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) {
    return apiError(c, 400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  // Endpoint + owner both matched: a row owned by someone else must not be
  // discoverable or deletable through this route.
  const deleted = await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.endpoint, parsed.data.endpoint), eq(pushSubscriptions.userId, id)),
    )
    .returning({ endpoint: pushSubscriptions.endpoint });

  if (deleted.length === 0) {
    return apiError(c, 404, "not_found", "No such subscription.");
  }

  return c.body(null, 204, { "cache-control": "no-store" });
});

export const pushRoutes = push;
