import { z } from "zod";

/**
 * Web Push (RFC 8030) subscription contract shared by the browser and the
 * Worker. Endpoints are opaque push-service URLs (each browser vendor runs
 * its own); we bound their length to keep D1 rows sane without pretending to
 * know the vendor's URL shape. Only https endpoints are ever valid.
 */
const pushEndpointSchema = z
  .string()
  .max(2048)
  .refine((value) => value.startsWith("https://"), "Endpoint must be an https URL.");

/**
 * Client encryption keys per RFC 8291: base64url-encoded octet strings
 * (padding tolerated). Lengths are upper bounds, not exact — the push
 * service issued them and the Worker only passes them through.
 */
const pushClientKeySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Key must be base64url.");

/** Browser -> Worker: store (or replace) this device's subscription. */
export const pushSubscriptionSchema = z
  .object({
    endpoint: pushEndpointSchema,
    keys: z
      .object({
        p256dh: pushClientKeySchema,
        auth: pushClientKeySchema,
      })
      .strict(),
  })
  .strict();

/** Browser -> Worker: this device unsubscribed (or the user turned it off). */
export const pushDeleteSchema = z.object({ endpoint: pushEndpointSchema }).strict();

/** Worker -> browser: the VAPID application-server public key (base64url). */
export const vapidKeyResponseSchema = z
  .object({
    publicKey: z.string().min(1),
  })
  .strict();

export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;
export type PushDelete = z.infer<typeof pushDeleteSchema>;
export type VapidKeyResponse = z.infer<typeof vapidKeyResponseSchema>;
