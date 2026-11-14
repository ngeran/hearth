import { z } from "zod";

/**
 * Shared contract for 1:1 chat (M4). Message bodies live only inside the
 * ChatRoom Durable Object; this module defines the wire schemas both sides
 * agree on plus the deterministic thread id used for `idFromName`.
 */

/** Longest body a member may send, counted after trimming. */
export const MESSAGE_BODY_MAX_LENGTH = 1000;

/**
 * Every C0/C1 control character except the newline. Newlines are allowed
 * because the composer inserts them with Shift+Enter; tabs and carriage
 * returns are normalised away by the client and rejected here.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching these characters is the whole point — message bodies must reject them.
const CONTROL_CHARACTERS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;

/** Trimmed, non-empty message body of at most 1,000 characters. */
export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Message must not be empty.")
  .max(MESSAGE_BODY_MAX_LENGTH, `Message must be at most ${MESSAGE_BODY_MAX_LENGTH} characters.`)
  .refine((body) => !CONTROL_CHARACTERS.test(body), "Message contains unsupported characters.");

/**
 * Deterministic thread id for a member pair: the two user ids in ascending
 * byte order behind a `chat:` prefix, so both members derive the same id
 * regardless of who opens the thread first.
 */
export function chatThreadId(a: string, b: string): string {
  const [low, high] = a < b ? [a, b] : [b, a];
  return `chat:${low}:${high}`;
}

/** One stored chat message. `sentAt` is unix seconds (UTC). */
export const chatMessageSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    author: z.string().min(1),
    body: messageBodySchema,
    sentAt: z.number().int().positive(),
  })
  .strict();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** Response of GET /api/v1/chats/:peerId/messages — ascending page plus tail. */
export const chatMessagesResponseSchema = z
  .object({
    messages: z.array(chatMessageSchema),
    lastSeq: z.number().int().nonnegative(),
  })
  .strict();

export type ChatMessagesResponse = z.infer<typeof chatMessagesResponseSchema>;

/**
 * One thread in the list response. `lastMessage.body` is a display-only
 * preview and therefore a plain string — the stored body stays inside the
 * Durable Object and previews may be truncated.
 */
export const chatThreadSchema = z
  .object({
    peerId: z.string().min(1),
    peerName: z.string().min(1),
    peerArea: z.string().nullable(),
    lastMessage: z
      .object({
        body: z.string(),
        sentByMe: z.boolean(),
        sentAt: z.number().int().positive(),
      })
      .nullable(),
    unread: z.boolean(),
  })
  .strict();

export type ChatThread = z.infer<typeof chatThreadSchema>;

/** Response of GET /api/v1/chats — the caller's thread list. */
export const chatsResponseSchema = z
  .object({
    chats: z.array(chatThreadSchema),
  })
  .strict();

export type ChatsResponse = z.infer<typeof chatsResponseSchema>;

/** Request body of POST /api/v1/chats — open (or find) a thread with a peer. */
export const startChatRequestSchema = z
  .object({
    peerId: z.string().min(1),
  })
  .strict();

export type StartChatRequest = z.infer<typeof startChatRequestSchema>;

/** Response of POST /api/v1/chats — the thread already exists for this pair. */
export const startChatResponseSchema = z
  .object({
    peerId: z.string().min(1),
  })
  .strict();

export type StartChatResponse = z.infer<typeof startChatResponseSchema>;

/** Request body of POST /api/v1/chats/:peerId/messages. */
export const sendMessageRequestSchema = z
  .object({
    body: messageBodySchema,
  })
  .strict();

export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
