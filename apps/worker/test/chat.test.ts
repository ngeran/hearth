import { env, SELF } from "cloudflare:test";
import { type ChatMessage, type ChatMessagesResponse, chatThreadId } from "@hearth/shared";
import { describe, expect, it } from "vitest";

/**
 * Roundtrip through the real ChatRoom Durable Object namespace: send → list →
 * read marker → unread state → cooldown → purge, plus membership and unknown
 * endpoint behaviour. Bodies live only inside the DO, so this is the layer
 * that proves the M4 storage contract.
 */

const OUTSIDER = "user-c";

function stubFor(user: string, peer: string): DurableObjectStub {
  // Same id derivation the worker routes use; a fresh name maps to a fresh DO.
  const id = env.CHAT.idFromName(chatThreadId(user, peer));
  return env.CHAT.get(id);
}

async function send(user: string, peer: string, body: string): Promise<Response> {
  return stubFor(user, peer).fetch("https://chat-room/send", {
    method: "POST",
    headers: { "x-hearth-user-id": user, "x-hearth-peer-id": peer },
    body: JSON.stringify({ body }),
  });
}

async function list(user: string, peer: string, after?: number): Promise<Response> {
  const url = new URL("https://chat-room/list");
  if (after !== undefined) url.searchParams.set("after", String(after));
  return stubFor(user, peer).fetch(url, {
    headers: { "x-hearth-user-id": user, "x-hearth-peer-id": peer },
  });
}

async function state(user: string, peer: string): Promise<Response> {
  return stubFor(user, peer).fetch("https://chat-room/state", {
    headers: { "x-hearth-user-id": user, "x-hearth-peer-id": peer },
  });
}

async function markRead(user: string, peer: string, seq: number): Promise<Response> {
  return stubFor(user, peer).fetch("https://chat-room/read", {
    method: "POST",
    headers: { "x-hearth-user-id": user, "x-hearth-peer-id": peer },
    body: JSON.stringify({ seq }),
  });
}

async function purge(user: string, peer: string): Promise<Response> {
  return stubFor(user, peer).fetch("https://chat-room/purge", {
    method: "POST",
    headers: { "x-hearth-user-id": user, "x-hearth-peer-id": peer },
  });
}

async function uniqueThread(): Promise<{ user: string; peer: string }> {
  // Distinct pair per test so DO storage never bleeds between tests.
  const suffix = crypto.randomUUID();
  return { user: `a-${suffix}`, peer: `b-${suffix}` };
}

describe("ChatRoom durable object", () => {
  it("stores, sequences and lists messages ascending", async () => {
    const { user, peer } = await uniqueThread();

    const first = await send(user, peer, "hello there");
    expect(first.status).toBe(200);
    const message = (await first.json()) as ChatMessage;
    expect(message).toMatchObject({ seq: 1, author: user, body: "hello there" });
    expect(message.sentAt).toBeGreaterThan(0);

    const second = await send(peer, user, "γεια σου!");
    expect(((await second.json()) as ChatMessage).seq).toBe(2);

    const page = await list(user, peer);
    expect(page.status).toBe(200);
    const data = (await page.json()) as ChatMessagesResponse;
    expect(data.messages.map((m) => m.seq)).toEqual([1, 2]);
    expect(data.messages.map((m) => m.author)).toEqual([user, peer]);
    expect(data.lastSeq).toBe(2);
  });

  it("honours the after cursor and validates list params", async () => {
    const { user, peer } = await uniqueThread();
    await send(user, peer, "one");
    await send(peer, user, "two");

    const tail = await list(user, peer, 1);
    const data = (await tail.json()) as ChatMessagesResponse;
    expect(data.messages.map((m) => m.body)).toEqual(["two"]);

    const bad = await list(user, peer, -1);
    expect(bad.status).toBe(400);
    const invalid = await stubFor(user, peer).fetch("https://chat-room/list?limit=abc", {
      headers: { "x-hearth-user-id": user, "x-hearth-peer-id": peer },
    });
    expect(invalid.status).toBe(400);
  });

  it("rejects empty, oversized and control-character bodies", async () => {
    const { user, peer } = await uniqueThread();
    expect((await send(user, peer, "   ")).status).toBe(400);
    expect((await send(user, peer, "α".repeat(1001))).status).toBe(400);
    expect((await send(user, peer, "bad\u0000char")).status).toBe(400);
  });

  it("rate limits sends to one per second per sender", async () => {
    const { user, peer } = await uniqueThread();
    expect((await send(user, peer, "first")).status).toBe(200);
    const throttled = await send(user, peer, "second");
    expect(throttled.status).toBe(429);
    expect(((await throttled.json()) as { error: { code: string } }).error.code).toBe(
      "rate_limited",
    );
  });

  it("tracks read markers per member and reports unread via state", async () => {
    const { user, peer } = await uniqueThread();
    await send(user, peer, "one");
    await send(peer, user, "two");

    const before = await state(peer, user);
    const stateBefore = (await before.json()) as { last: ChatMessage | null; myRead: number };
    expect(stateBefore.last?.seq).toBe(2);
    expect(stateBefore.myRead).toBe(0);

    expect((await markRead(peer, user, 2)).status).toBe(200);
    const after = await state(peer, user);
    expect(((await after.json()) as { myRead: number }).myRead).toBe(2);

    // Read markers only move forward.
    await markRead(peer, user, 1);
    const unchanged = await state(peer, user);
    expect(((await unchanged.json()) as { myRead: number }).myRead).toBe(2);
  });

  it("admits only thread members", async () => {
    const { user, peer } = await uniqueThread();
    await send(user, peer, "private");

    // Same DO, forged identity: the outsider is not in the stored meta pair.
    const outsider = await stubFor(user, peer).fetch("https://chat-room/send", {
      method: "POST",
      headers: { "x-hearth-user-id": OUTSIDER, "x-hearth-peer-id": user },
      body: JSON.stringify({ body: "let me in" }),
    });
    expect(outsider.status).toBe(403);

    const anonymous = await stubFor(user, peer).fetch("https://chat-room/list");
    expect(anonymous.status).toBe(403);
  });

  it("returns 404 for unknown endpoints", async () => {
    const { user, peer } = await uniqueThread();
    const res = await stubFor(user, peer).fetch("https://chat-room/unknown", {
      headers: { "x-hearth-user-id": user, "x-hearth-peer-id": peer },
    });
    expect(res.status).toBe(404);
  });

  it("purges every stored key", async () => {
    const { user, peer } = await uniqueThread();
    await send(user, peer, "one");
    await send(peer, user, "two");
    await markRead(peer, user, 2);

    expect((await purge(user, peer)).status).toBe(200);

    const empty = await list(user, peer);
    const data = (await empty.json()) as ChatMessagesResponse;
    expect(data.messages).toEqual([]);
    expect(data.lastSeq).toBe(0);

    const cleared = await state(user, peer);
    expect(
      ((await cleared.json()) as { last: ChatMessage | null; myRead: number }).last,
    ).toBeNull();
  });

  it("keeps the health endpoint unaffected by the new binding", async () => {
    const res = await SELF.fetch("https://hearth.test/api/v1/health");
    expect(res.status).toBe(200);
  });
});
