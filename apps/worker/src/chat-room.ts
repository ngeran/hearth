import {
  type ChatMessage,
  chatMessageSchema,
  chatMessagesResponseSchema,
  sendMessageRequestSchema,
} from "@hearth/shared";
import { z } from "zod";
import type { Env } from "./env";

/**
 * 1:1 conversation Durable Object (binding `CHAT`, SQLite-backed).
 *
 * Storage layout (keys are part of the M4 spec — do not rename):
 * - `meta`                → { userLow, userHigh }   member ids, set on first contact
 * - `seq`                 → number                  last allocated message sequence
 * - `last`                → { seq, author, body, ts } tail marker for previews
 * - `m:<12-digit seq>`    → { author, body, ts }     one message body (bodies live
 *                                                      ONLY here, never in D1)
 * - `read:<userId>`       → number                   last read sequence
 * - `cooldown:<userId>`   → epoch ms                 1 s send cooldown per sender
 *
 * The DO trusts only worker-originated requests: the worker authenticates the
 * member at the route layer and forwards the verified id in `x-hearth-user-id`
 * (plus `x-hearth-peer-id`, used to initialise `meta` on first contact).
 * Message bodies are never logged.
 */

const SEND_COOLDOWN_MS = 1000;
const LIST_LIMIT_MAX = 50;
const readMarkerSchema = z.object({ seq: z.number().int().nonnegative() }).strict();
/** Messages are keyed `m:` + a zero-padded sequence so list order is byte order. */
const messageKey = (seq: number) => `m:${String(seq).padStart(12, "0")}`;

interface StoredMessage {
  author: string;
  body: string;
  ts: number;
}

interface ThreadMeta {
  userLow: string;
  userHigh: string;
}

interface StoredTail {
  seq: number;
  author: string;
  body: string;
  ts: number;
}

const errorResponse = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

export class ChatRoom implements DurableObject {
  constructor(
    private readonly ctx: DurableObjectState,
    _env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = request.headers.get("x-hearth-user-id");
    const peerId = request.headers.get("x-hearth-peer-id");
    if (!userId || !peerId) {
      return errorResponse(403, "forbidden", "Members only.");
    }

    const meta = await this.ensureMeta(userId, peerId);
    if (userId !== meta.userLow && userId !== meta.userHigh) {
      return errorResponse(403, "forbidden", "Members only.");
    }

    if (request.method === "POST" && url.pathname === "/send") {
      return this.send(userId, request);
    }
    if (request.method === "GET" && url.pathname === "/list") {
      return this.list(url);
    }
    if (request.method === "GET" && url.pathname === "/state") {
      return this.state(userId);
    }
    if (request.method === "POST" && url.pathname === "/read") {
      return this.markRead(userId, request);
    }
    if (request.method === "POST" && url.pathname === "/purge") {
      return this.purge();
    }
    return errorResponse(404, "not_found", "Unknown chat endpoint.");
  }

  /** Returns the thread meta, initialising it from the first contacting pair. */
  private async ensureMeta(userId: string, peerId: string): Promise<ThreadMeta> {
    const existing = await this.ctx.storage.get<ThreadMeta>("meta");
    if (existing) return existing;
    // chatThreadId orders the pair identically to the D1 row and idFromName.
    const [userLow, userHigh] = userId < peerId ? [userId, peerId] : [peerId, userId];
    const meta: ThreadMeta = { userLow, userHigh };
    await this.ctx.storage.put("meta", meta);
    return meta;
  }

  private async send(userId: string, request: Request): Promise<Response> {
    const parsed = sendMessageRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse(
        400,
        "bad_request",
        parsed.error.issues[0]?.message ?? "Invalid message.",
      );
    }

    const cooldownKey = `cooldown:${userId}`;
    const lastSend = await this.ctx.storage.get<number>(cooldownKey);
    const nowMs = Date.now();
    if (lastSend !== undefined && nowMs - lastSend < SEND_COOLDOWN_MS) {
      return errorResponse(429, "rate_limited", "Wait a moment before sending again.");
    }

    const seq = ((await this.ctx.storage.get<number>("seq")) ?? 0) + 1;
    const stored: StoredMessage = {
      author: userId,
      body: parsed.data.body,
      ts: Math.floor(nowMs / 1000),
    };
    const tail: StoredTail = { seq, ...stored };
    await this.ctx.storage.put(messageKey(seq), stored);
    await this.ctx.storage.put("seq", seq);
    await this.ctx.storage.put("last", tail);
    await this.ctx.storage.put(cooldownKey, nowMs);

    const message: ChatMessage = {
      seq,
      author: stored.author,
      body: stored.body,
      sentAt: stored.ts,
    };
    return Response.json(chatMessageSchema.parse(message));
  }

  private async list(url: URL): Promise<Response> {
    const afterParam = url.searchParams.get("after");
    const limitParam = url.searchParams.get("limit");
    let after = 0;
    let limit = LIST_LIMIT_MAX;
    if (
      afterParam !== null &&
      (!/^\d+$/.test(afterParam) || Number(afterParam) > Number.MAX_SAFE_INTEGER)
    ) {
      return errorResponse(400, "bad_request", "Invalid after sequence.");
    }
    if (afterParam !== null) after = Number(afterParam);
    if (limitParam !== null) {
      if (!/^\d+$/.test(limitParam)) {
        return errorResponse(400, "bad_request", "Invalid limit.");
      }
      limit = Math.min(LIST_LIMIT_MAX, Math.max(1, Number(limitParam)));
    }

    const options: DurableObjectListOptions = { prefix: "m:", limit };
    if (after > 0) {
      options.startAfter = messageKey(after);
    }
    const entries = await this.ctx.storage.list<StoredMessage>(options);
    const messages: ChatMessage[] = [];
    for (const [key, stored] of entries) {
      const seq = Number(key.slice(2));
      messages.push({ seq, author: stored.author, body: stored.body, sentAt: stored.ts });
    }
    const lastSeq = (await this.ctx.storage.get<number>("seq")) ?? 0;
    return Response.json(chatMessagesResponseSchema.parse({ messages, lastSeq }));
  }

  private async state(userId: string): Promise<Response> {
    const tail = await this.ctx.storage.get<StoredTail>("last");
    const myRead = (await this.ctx.storage.get<number>(`read:${userId}`)) ?? 0;
    const last: ChatMessage | null = tail
      ? { seq: tail.seq, author: tail.author, body: tail.body, sentAt: tail.ts }
      : null;
    return Response.json({ last, myRead });
  }

  private async markRead(userId: string, request: Request): Promise<Response> {
    const parsed = readMarkerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse(400, "bad_request", "Invalid read sequence.");
    }
    const key = `read:${userId}`;
    const current = (await this.ctx.storage.get<number>(key)) ?? 0;
    if (parsed.data.seq > current) {
      await this.ctx.storage.put(key, parsed.data.seq);
    }
    return Response.json({ ok: true });
  }

  private async purge(): Promise<Response> {
    // Called by the worker's account-deletion flow (member identity forwarded)
    // before the D1/R2 cleanup removes the thread rows themselves.
    await this.ctx.storage.deleteAll();
    return Response.json({ ok: true });
  }
}
