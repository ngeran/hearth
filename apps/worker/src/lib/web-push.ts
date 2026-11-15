import { ApplicationServerKeys, generatePushHTTPRequest } from "webpush-webcrypto";
import { z } from "zod";

import type { Env } from "../env";

/**
 * Web Push helpers (docs/specs/M6.md).
 *
 * The push payload never carries a message body — only the sender's display
 * name and a deep link — so nothing a recipient could read on a lock screen
 * reveals what was actually said (privacy-by-default decision row 2).
 */

/** Notifications are ephemeral: an unread banner older than an hour has no value. */
const PUSH_TTL_SECONDS = 3600;

const PUSH_URGENCY = "normal" as const;

/** Payload contract with the service worker — it renders this as-is. */
export interface ChatPushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Localized notification text. Sender's display name is inflected as-is;
 * the Greek copy is native and uses the informal register (spec Copy section).
 */
export function buildChatPushPayload(
  senderName: string,
  senderId: string,
  language: "en" | "el",
): string {
  // Complete profiles always carry a display name; the generic fallback is
  // only a defensive path (e.g. a job produced before a profile rename).
  const hasName = senderName.trim().length > 0;
  const body =
    language === "el"
      ? hasName
        ? `Ο ${senderName} σου έστειλε μήνυμα`
        : "Έχεις νέο μήνυμα"
      : hasName
        ? `${senderName} sent you a message`
        : "You have a new message";
  const payload: ChatPushPayload = {
    title: "Hearth",
    body,
    url: `/messages?with=${encodeURIComponent(senderId)}`,
  };
  return JSON.stringify(payload);
}

/**
 * Shape of a chat-notification job on the JOBS queue. The producer is the
 * chats route; the consumer (lib/push-jobs.ts) re-checks unread state before
 * delivering. threadLow/threadHigh are the ordered pair from the D1 row.
 */
export const pushJobSchema = z
  .object({
    recipientId: z.string().min(1),
    senderId: z.string().min(1),
    senderName: z.string(),
    threadLow: z.string().min(1),
    threadHigh: z.string().min(1),
  })
  .strict();

export type PushJob = z.infer<typeof pushJobSchema>;

/**
 * Loads the VAPID signing keys from environment. Missing or malformed keys
 * behave exactly like "not configured" — pushes are skipped, sends never fail.
 * The result is cached by the caller per queue batch (fromJSON imports keys).
 */
export async function loadVapidKeys(env: Env): Promise<ApplicationServerKeys | null> {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    return null;
  }
  try {
    return await ApplicationServerKeys.fromJSON({ publicKey, privateKey });
  } catch {
    return null;
  }
}

/** What the queue consumer should do after a push attempt. */
export type PushSendOutcome =
  | { kind: "sent" }
  /** 404/410 from the push service: the subscription expired — delete the row. */
  | { kind: "prune" }
  /** VAPID keys unset: skip silently (staging before setup, misconfig later). */
  | { kind: "unconfigured" }
  /** Anything else: counted as a failure, retried by the queue up to max_retries. */
  | { kind: "failed"; status: number };

/**
 * Sends one encrypted push to one subscription row. The VAPID keys are passed
 * in (loaded once per batch) so N subscriptions cost one key import.
 */
export async function sendPushToSubscription(
  env: Env,
  keys: ApplicationServerKeys | null,
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: string,
): Promise<PushSendOutcome> {
  // adminContact is the VAPID subject; without it the request cannot be signed.
  if (!keys || !env.VAPID_SUBJECT) {
    return { kind: "unconfigured" };
  }
  try {
    const request = await generatePushHTTPRequest({
      payload,
      applicationServerKeys: keys,
      target: {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      adminContact: env.VAPID_SUBJECT,
      ttl: PUSH_TTL_SECONDS,
      urgency: PUSH_URGENCY,
    });
    const response = await fetch(request.endpoint, {
      method: "POST",
      headers: request.headers,
      body: request.body,
    });
    if (response.status === 404 || response.status === 410) {
      return { kind: "prune" };
    }
    if (!response.ok) {
      return { kind: "failed", status: response.status };
    }
    return { kind: "sent" };
  } catch {
    return { kind: "failed", status: 0 };
  }
}
