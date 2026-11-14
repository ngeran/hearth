import {
  type ChatThread,
  chatMessageSchema,
  chatMessagesResponseSchema,
  chatsResponseSchema,
  chatThreadId,
  isOnboardingComplete,
  matchEligibility,
  sendMessageRequestSchema,
  startChatRequestSchema,
  startChatResponseSchema,
} from "@hearth/shared";
import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { createDb } from "../db/client";
import { chatThreads, profiles, rooms, users } from "../db/schema";
import type { Env } from "../env";
import { toProfileSnapshot } from "../lib/profiles";
import { apiError, readJsonBody } from "../lib/responses";
import { nowDate } from "../lib/time";
import { requireSession } from "../middleware/session";
import type { AppEnv } from "../types";

/**
 * /api/v1/chats — thread discovery and message relay. Auth stays here
 * (requireSession); the ChatRoom Durable Object below trusts only the
 * verified id forwarded in `x-hearth-user-id`. Message bodies transit this
 * route but are never logged and never written to D1.
 */

const THREADS_LIMIT = 50;
const PREVIEW_MAX_LENGTH = 80;

const threadStateSchema = z.object({
  last: chatMessageSchema.nullable(),
  myRead: z.number().int().nonnegative(),
});

const chats = new Hono<AppEnv>();

chats.use("*", requireSession);

/** Resolve the DO stub for a member pair (id ordering matches chatThreadId). */
function chatStub(env: Env, me: string, peer: string): DurableObjectStub {
  return env.CHAT.get(env.CHAT.idFromName(chatThreadId(me, peer)));
}

/** Relay a DO reply (including its error envelope) to the API client. */
async function relay(res: Response): Promise<Response> {
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function threadKey(me: string, peer: string): { userLow: string; userHigh: string } {
  return me < peer ? { userLow: me, userHigh: peer } : { userLow: peer, userHigh: me };
}

async function findThreadRow(db: ReturnType<typeof createDb>, me: string, peer: string) {
  const { userLow, userHigh } = threadKey(me, peer);
  return (
    (await db
      .select()
      .from(chatThreads)
      .where(and(eq(chatThreads.userLow, userLow), eq(chatThreads.userHigh, userHigh)))
      .get()) ?? null
  );
}

chats.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const rows = await db
    .select()
    .from(chatThreads)
    .where(or(eq(chatThreads.userLow, id), eq(chatThreads.userHigh, id)))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(THREADS_LIMIT);

  const list: ChatThread[] = [];

  for (const row of rows) {
    const peerId = row.userLow === id ? row.userHigh : row.userLow;
    const peerRow = await db.select().from(profiles).where(eq(profiles.userId, peerId)).get();
    if (!peerRow) {
      // FK cascade makes this unreachable; skip rather than fail the list.
      continue;
    }
    const peer = toProfileSnapshot(peerRow);

    const res = await chatStub(c.env, id, peerId).fetch("https://chat-room/state", {
      headers: { "x-hearth-user-id": id, "x-hearth-peer-id": peerId },
    });
    if (!res.ok) {
      continue;
    }
    const state = threadStateSchema.parse(await res.json());

    const lastMessage =
      state.last === null
        ? null
        : {
            body:
              state.last.body.length > PREVIEW_MAX_LENGTH
                ? `${state.last.body.slice(0, PREVIEW_MAX_LENGTH - 1)}…`
                : state.last.body,
            sentByMe: state.last.author === id,
            sentAt: state.last.sentAt,
          };

    list.push({
      peerId,
      peerName: peer.displayName ?? peerId,
      peerArea: peer.areaLabel,
      lastMessage,
      unread: state.last !== null && state.last.seq > state.myRead,
    });
  }

  return c.json(chatsResponseSchema.parse({ chats: list }));
});

chats.post("/", async (c) => {
  const parsed = startChatRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) {
    return apiError(c, 400, "bad_request", "Send the member to chat with.");
  }

  const db = createDb(c.env.DB);
  const id = c.get("user").id;
  const peerId = parsed.data.peerId;

  if (peerId === id) {
    return apiError(c, 400, "bad_request", "You cannot chat with yourself.");
  }

  const meRow = await db.select().from(profiles).where(eq(profiles.userId, id)).get();
  const meSnapshot = meRow ? toProfileSnapshot(meRow) : null;
  if (!meSnapshot || !isOnboardingComplete(meSnapshot) || !meSnapshot.lifestyle) {
    return apiError(c, 403, "forbidden", "Finish your profile to start chats.");
  }

  const peerJoin = await db
    .select({ profile: profiles, user: users })
    .from(profiles)
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(eq(profiles.userId, peerId))
    .get();

  if (!peerJoin) {
    return apiError(c, 404, "not_found", "No such member.");
  }

  // Same gates as the matches list (M3): eligibility decides who may START a
  // chat; existing threads above stay readable even if gates later fail.
  // Exception (M5.md Decision 4): a member with an ACTIVE room listing can
  // always be contacted for that first thread — saying hi about a room must
  // not depend on lifestyle gates. Both sides still need complete, active
  // accounts, and every rule after thread creation (cooldown, purge) applies
  // unchanged.
  const peerSnapshot = toProfileSnapshot(peerJoin.profile);
  const peerHasActiveListing = Boolean(
    await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.listerId, peerId), eq(rooms.status, "active")))
      .get(),
  );
  if (
    peerJoin.user.status !== "active" ||
    peerJoin.user.deletedAt !== null ||
    !isOnboardingComplete(peerSnapshot) ||
    !peerSnapshot.lifestyle ||
    (!peerHasActiveListing && !matchEligibility(meSnapshot, peerSnapshot))
  ) {
    return apiError(c, 403, "forbidden", "You are not currently matched with this member.");
  }

  const { userLow, userHigh } = threadKey(id, peerId);
  const now = nowDate();
  await db
    .insert(chatThreads)
    .values({ userLow, userHigh, createdAt: now, updatedAt: now })
    .onConflictDoNothing();

  return c.json(startChatResponseSchema.parse({ peerId }), 200, { "cache-control": "no-store" });
});

chats.get("/:peerId/messages", async (c) => {
  const peerId = c.req.param("peerId");
  const id = c.get("user").id;
  const afterParam = c.req.query("after");

  let after = 0;
  if (afterParam !== undefined) {
    if (!/^\d+$/.test(afterParam)) {
      return apiError(c, 400, "bad_request", "Invalid after sequence.");
    }
    after = Number(afterParam);
  }

  const db = createDb(c.env.DB);
  const row = await findThreadRow(db, id, peerId);
  if (!row) {
    return apiError(c, 404, "not_found", "No conversation with this member.");
  }

  const res = await chatStub(c.env, id, peerId).fetch(`https://chat-room/list?after=${after}`, {
    headers: { "x-hearth-user-id": id, "x-hearth-peer-id": peerId },
  });
  if (!res.ok) {
    return relay(res);
  }
  const data = chatMessagesResponseSchema.parse(await res.json());

  // Opening the thread marks it read (unread lives in the list only).
  try {
    await chatStub(c.env, id, peerId).fetch("https://chat-room/read", {
      method: "POST",
      headers: { "x-hearth-user-id": id, "x-hearth-peer-id": peerId },
      body: JSON.stringify({ seq: data.lastSeq }),
    });
  } catch {
    // A missed read marker only means the dot stays; never fail the page.
  }

  return c.json(data, 200, { "cache-control": "no-store" });
});

chats.post("/:peerId/messages", async (c) => {
  const peerId = c.req.param("peerId");
  const id = c.get("user").id;

  const parsed = sendMessageRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) {
    return apiError(c, 400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid message.");
  }

  const db = createDb(c.env.DB);
  const row = await findThreadRow(db, id, peerId);
  if (!row) {
    return apiError(c, 404, "not_found", "No conversation with this member.");
  }

  const res = await chatStub(c.env, id, peerId).fetch("https://chat-room/send", {
    method: "POST",
    headers: { "x-hearth-user-id": id, "x-hearth-peer-id": peerId },
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) {
    // Passes the DO's envelope through — e.g. 429 rate_limited (1 s cooldown).
    return relay(res);
  }
  const message = chatMessageSchema.parse(await res.json());

  // The stored message body already lives in the DO; D1 only tracks recency.
  await db
    .update(chatThreads)
    .set({ updatedAt: nowDate() })
    .where(and(eq(chatThreads.userLow, row.userLow), eq(chatThreads.userHigh, row.userHigh)));

  return c.json(message, 201, { "cache-control": "no-store" });
});

export const chatsRoutes = chats;
