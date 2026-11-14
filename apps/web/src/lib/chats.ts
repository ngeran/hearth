import {
  type ChatMessage,
  type ChatMessagesResponse,
  type ChatsResponse,
  chatMessageSchema,
  chatMessagesResponseSchema,
  chatsResponseSchema,
  type StartChatResponse,
  startChatResponseSchema,
} from "@hearth/shared";

import { requestJson } from "@/lib/me";

/** My thread list, newest activity first. */
export async function fetchChats(): Promise<ChatsResponse> {
  const response = await fetch("/api/v1/chats", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });

  return requestJson(response, chatsResponseSchema);
}

/** Open (or find) the thread with a peer. Idempotent; returns the peer id. */
export async function startChat(peerId: string): Promise<StartChatResponse> {
  const response = await fetch("/api/v1/chats", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ peerId }),
  });

  return requestJson(response, startChatResponseSchema);
}

/**
 * The most recent messages of a thread, ascending. Polling re-fetches the
 * same tail window (after 0) — simple and always consistent at chat scale.
 */
export async function fetchThreadMessages(
  peerId: string,
  after = 0,
): Promise<ChatMessagesResponse> {
  const response = await fetch(
    `/api/v1/chats/${encodeURIComponent(peerId)}/messages?after=${after}`,
    {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    },
  );

  return requestJson(response, chatMessagesResponseSchema);
}

/** Send one message; the stored message comes back. */
export async function sendThreadMessage(peerId: string, body: string): Promise<ChatMessage> {
  const response = await fetch(`/api/v1/chats/${encodeURIComponent(peerId)}/messages`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ body }),
  });

  return requestJson(response, chatMessageSchema);
}
