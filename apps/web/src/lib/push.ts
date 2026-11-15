import type { PushSubscription as PushSubscriptionRow } from "@hearth/shared";
import { vapidKeyResponseSchema } from "@hearth/shared";

import { readError, requestJson } from "@/lib/me";

/**
 * Web-push client helpers. All calls are same-origin and session-cookie
 * authenticated; the push subscription row mirrors what this browser's
 * `pushManager` holds so the worker can deliver (and prune) quietly.
 */

export async function fetchVapidKey(): Promise<string> {
  const response = await fetch("/api/v1/me/push/key", {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  const parsed = await requestJson(response, vapidKeyResponseSchema);
  return parsed.publicKey;
}

function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

/** The browser subscription for this device, or null when none exists. */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    throw new Error("Incomplete push subscription from the browser.");
  }
  const row: PushSubscriptionRow = { endpoint, keys: { p256dh, auth } };
  const response = await fetch("/api/v1/me/push", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    throw await readError(response);
  }
}

/**
 * Full opt-in flow: permission gesture → subscribe with the server's VAPID
 * key → persist the row. Returns "denied" when the browser prompt is declined
 * (not an error); throws ApiRequestError on transport/config problems.
 */
export async function enablePushNotifications(): Promise<"enabled" | "denied"> {
  const publicKey = await fetchVapidKey();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return "denied";
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    throw new Error("Service worker is not registered yet.");
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await savePushSubscription(subscription);
  return "enabled";
}

/**
 * Opt-out: drop the local subscription first, then the server row. A missed
 * server row is harmless — delivery to a dead endpoint 404/410s and the
 * consumer prunes it.
 */
export async function disablePushNotifications(): Promise<void> {
  const subscription = await getCurrentPushSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    const response = await fetch("/api/v1/me/push", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    if (!response.ok) {
      throw await readError(response);
    }
  }
}
