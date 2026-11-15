import { chatMessageSchema, chatThreadId } from "@hearth/shared";
import { and, eq } from "drizzle-orm";
import type { ApplicationServerKeys } from "webpush-webcrypto";
import { z } from "zod";

import { createDb } from "../db/client";
import { profiles, pushSubscriptions } from "../db/schema";
import type { Env } from "../env";
import {
  buildChatPushPayload,
  loadVapidKeys,
  type PushJob,
  pushJobSchema,
  sendPushToSubscription,
} from "./web-push";

/**
 * JOBS queue consumer for chat notifications (docs/specs/M6.md). Each job is
 * checked against the recipient's read marker at consume time — not send
 * time — so a member who already read the thread (or wrote the last message)
 * never gets a push. Logs carry counts only; push endpoints and client keys
 * never appear in them.
 */

const threadStateSchema = z.object({
  last: chatMessageSchema.nullable(),
  myRead: z.number().int().nonnegative(),
});

type Db = ReturnType<typeof createDb>;
type DeliveryResult = "sent" | "pruned" | "failed" | "skipped";

export async function handlePushBatch(batch: MessageBatch, env: Env): Promise<void> {
  // Loaded once per batch: fromJSON imports both keys (kept hot for the loop).
  const keys = await loadVapidKeys(env);
  const db = createDb(env.DB);

  let sent = 0;
  let pruned = 0;
  let failed = 0;
  let skipped = 0;
  let invalid = 0;

  for (const message of batch.messages) {
    const parsed = pushJobSchema.safeParse(message.body);
    if (!parsed.success) {
      invalid += 1;
      message.ack(); // Malformed jobs are dropped, never retried.
      continue;
    }
    if (keys === null) {
      skipped += 1;
      message.ack(); // VAPID unconfigured: nothing can be delivered.
      continue;
    }
    try {
      const result = await deliverPushJob(env, db, keys, parsed.data);
      if (result === "sent") {
        sent += 1;
      } else if (result === "pruned") {
        pruned += 1;
      } else if (result === "failed") {
        failed += 1;
      } else {
        skipped += 1;
      }
      if (result === "failed") {
        // Transient push-service trouble — the queue retries (max_retries: 3).
        message.retry();
      } else {
        message.ack();
      }
    } catch {
      // D1/DO hiccup — retry the job; the unread check re-runs safely.
      message.retry();
    }
  }

  console.log(
    `push batch: jobs=${batch.messages.length} sent=${sent} pruned=${pruned} failed=${failed} skipped=${skipped} invalid=${invalid}`,
  );
}

async function deliverPushJob(
  env: Env,
  db: Db,
  keys: ApplicationServerKeys,
  job: PushJob,
): Promise<DeliveryResult> {
  // Unread check as the recipient, exactly like the thread list does.
  const stub = env.CHAT.get(env.CHAT.idFromName(chatThreadId(job.threadLow, job.threadHigh)));
  const stateRes = await stub.fetch("https://chat-room/state", {
    headers: { "x-hearth-user-id": job.recipientId, "x-hearth-peer-id": job.senderId },
  });
  if (!stateRes.ok) {
    return "failed";
  }
  const state = threadStateSchema.safeParse(await stateRes.json());
  if (!state.success) {
    return "failed";
  }

  // Recipient already caught up (or wrote the last message): stay quiet.
  if (
    !state.data.last ||
    state.data.last.seq <= state.data.myRead ||
    state.data.last.author === job.recipientId
  ) {
    return "skipped";
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, job.recipientId));
  if (subscriptions.length === 0) {
    return "skipped";
  }

  const profileRow = await db
    .select({ language: profiles.language })
    .from(profiles)
    .where(eq(profiles.userId, job.recipientId))
    .get();
  const language = profileRow?.language === "el" ? "el" : "en";

  const payload = buildChatPushPayload(job.senderName, job.senderId, language);
  let pruned = false;
  for (const subscription of subscriptions) {
    const outcome = await sendPushToSubscription(
      env,
      keys,
      { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
      payload,
    );
    if (outcome.kind === "prune") {
      // Push service says the subscription is gone (404/410) — drop the row.
      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, subscription.endpoint),
            eq(pushSubscriptions.userId, job.recipientId),
          ),
        );
      pruned = true;
    } else if (outcome.kind === "unconfigured") {
      // VAPID subject missing: global condition — nothing more to try.
      break;
    } else if (outcome.kind === "failed") {
      // Retry covers every subscription; returning "failed" immediately keeps
      // already-sent pushes from double-firing on the retried attempt.
      return "failed";
    }
  }
  return pruned ? "pruned" : "sent";
}
