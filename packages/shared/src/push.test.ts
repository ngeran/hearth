import { describe, expect, it } from "vitest";
import { pushDeleteSchema, pushSubscriptionSchema, vapidKeyResponseSchema } from "./push";

const validSubscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/some-registration-id",
  keys: {
    p256dh:
      "BFF2jH5aSrfJr6cSwM8q3HqGz6jXPK8c4vY2NqLmzVxR1dT4wE7fU9iO0pA5bC6dE8gH9iJ0kL1mN3oP5qR7sT9u",
    auth: "aBcDeFgHiJkLmNoPqRsTuV",
  },
} as const;

describe("pushSubscriptionSchema", () => {
  it("accepts a well-formed subscription", () => {
    const parsed = pushSubscriptionSchema.safeParse(validSubscription);
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-https endpoint", () => {
    const parsed = pushSubscriptionSchema.safeParse({
      ...validSubscription,
      endpoint: "http://fcm.googleapis.com/fcm/send/some-registration-id",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an endpoint longer than 2048 characters", () => {
    const parsed = pushSubscriptionSchema.safeParse({
      ...validSubscription,
      endpoint: `https://example.com/push/${"a".repeat(2100)}`,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects empty or missing client keys", () => {
    expect(
      pushSubscriptionSchema.safeParse({
        ...validSubscription,
        keys: { ...validSubscription.keys, p256dh: "" },
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: validSubscription.endpoint,
        keys: { auth: validSubscription.keys.auth },
      }).success,
    ).toBe(false);
  });

  it("rejects client keys that are not base64url", () => {
    const parsed = pushSubscriptionSchema.safeParse({
      ...validSubscription,
      keys: { ...validSubscription.keys, auth: "not valid/base64!!" },
    });
    expect(parsed.success).toBe(false);
  });

  it("is strict about unknown keys", () => {
    expect(
      pushSubscriptionSchema.safeParse({
        ...validSubscription,
        keys: { ...validSubscription.keys, extra: "field" },
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({ ...validSubscription, expirationTime: 123 }).success,
    ).toBe(false);
  });
});

describe("pushDeleteSchema", () => {
  it("accepts an https endpoint", () => {
    const parsed = pushDeleteSchema.safeParse({ endpoint: validSubscription.endpoint });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-https endpoint and unknown keys", () => {
    expect(
      pushDeleteSchema.safeParse({ endpoint: `https://x.example/p${" ".repeat(3000)}` }).success,
    ).toBe(false);
    expect(pushDeleteSchema.safeParse({ endpoint: "http://x.example/p" }).success).toBe(false);
    expect(
      pushDeleteSchema.safeParse({ endpoint: validSubscription.endpoint, userId: "u" }).success,
    ).toBe(false);
  });
});

describe("vapidKeyResponseSchema", () => {
  it("accepts a non-empty public key and is strict", () => {
    expect(vapidKeyResponseSchema.safeParse({ publicKey: "BPkZx" }).success).toBe(true);
    expect(vapidKeyResponseSchema.safeParse({ publicKey: "" }).success).toBe(false);
    expect(
      vapidKeyResponseSchema.safeParse({ publicKey: "BPkZx", privateKey: "nope" }).success,
    ).toBe(false);
  });
});
