import { describe, expect, it } from "vitest";
import {
  chatMessageSchema,
  chatMessagesResponseSchema,
  chatThreadId,
  chatThreadSchema,
  messageBodySchema,
  sendMessageRequestSchema,
  startChatResponseSchema,
} from "./chat";

describe("messageBodySchema", () => {
  it("trims surrounding whitespace", () => {
    expect(messageBodySchema.parse("  γεια σου  ")).toBe("γεια σου");
  });

  it("rejects whitespace-only bodies", () => {
    expect(messageBodySchema.safeParse("   \n\t").success).toBe(false);
  });

  it("accepts 1,000 characters", () => {
    expect(messageBodySchema.safeParse("α".repeat(1000)).success).toBe(true);
  });

  it("rejects 1,001 characters", () => {
    expect(messageBodySchema.safeParse("α".repeat(1001)).success).toBe(false);
  });

  it("allows newlines but no other control characters", () => {
    expect(messageBodySchema.safeParse("line one\nline two").success).toBe(true);
    for (const body of [
      "line one\r\nline two",
      "tab\there",
      "nul\u0000",
      "del\u007F",
      "c1\u009F",
    ]) {
      expect(messageBodySchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("chatThreadId", () => {
  it("is symmetric in its arguments", () => {
    expect(chatThreadId("user-b", "user-a")).toBe(chatThreadId("user-a", "user-b"));
  });

  it("orders the two ids by byte comparison", () => {
    expect(chatThreadId("user-b", "user-a")).toBe("chat:user-a:user-b");
  });

  it("differs for a different pair", () => {
    expect(chatThreadId("user-a", "user-b")).not.toBe(chatThreadId("user-a", "user-c"));
  });
});

describe("chatMessageSchema", () => {
  it("accepts a valid message", () => {
    const message = { seq: 3, author: "user-a", body: "hello there", sentAt: 1794800000 };
    expect(chatMessageSchema.parse(message)).toEqual(message);
  });

  it("rejects negative or fractional sequence numbers", () => {
    const base = { author: "user-a", body: "hi", sentAt: 1794800000 };
    expect(chatMessageSchema.safeParse({ ...base, seq: -1 }).success).toBe(false);
    expect(chatMessageSchema.safeParse({ ...base, seq: 1.5 }).success).toBe(false);
  });

  it("rejects an empty author", () => {
    expect(
      chatMessageSchema.safeParse({ seq: 1, author: "", body: "hi", sentAt: 1794800000 }).success,
    ).toBe(false);
  });

  it("is strict about unknown keys", () => {
    expect(
      chatMessageSchema.safeParse({
        seq: 1,
        author: "user-a",
        body: "hi",
        sentAt: 1794800000,
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("thread and response schemas", () => {
  it("accepts a thread without a last message", () => {
    const thread = {
      peerId: "user-b",
      peerName: "Maria",
      peerArea: null,
      lastMessage: null,
      unread: false,
    };
    expect(chatThreadSchema.parse(thread)).toEqual(thread);
  });

  it("accepts a thread with a preview last message", () => {
    const thread = {
      peerId: "user-b",
      peerName: "Maria",
      peerArea: "Koukaki, Athens",
      lastMessage: { body: "Πες ένα γεια…", sentByMe: false, sentAt: 1794800000 },
      unread: true,
    };
    expect(chatThreadSchema.parse(thread)).toEqual(thread);
  });

  it("rejects an empty peer name", () => {
    expect(
      chatThreadSchema.safeParse({
        peerId: "user-b",
        peerName: "",
        peerArea: null,
        lastMessage: null,
        unread: false,
      }).success,
    ).toBe(false);
  });

  it("messages response carries an ascending page plus the tail marker", () => {
    const response = {
      messages: [
        { seq: 1, author: "user-a", body: "hi", sentAt: 1794800000 },
        { seq: 2, author: "user-b", body: "hello!", sentAt: 1794800010 },
      ],
      lastSeq: 2,
    };
    expect(chatMessagesResponseSchema.parse(response)).toEqual(response);
  });

  it("start chat response echoes the peer id and nothing else", () => {
    expect(startChatResponseSchema.parse({ peerId: "user-b" })).toEqual({ peerId: "user-b" });
    expect(startChatResponseSchema.safeParse({ peerId: "user-b", extra: true }).success).toBe(
      false,
    );
  });
});

describe("sendMessageRequestSchema", () => {
  it("accepts a valid body and trims it", () => {
    expect(sendMessageRequestSchema.parse({ body: "  hi  " })).toEqual({ body: "hi" });
  });

  it("is strict about unknown keys", () => {
    expect(sendMessageRequestSchema.safeParse({ body: "hi", peerId: "user-b" }).success).toBe(
      false,
    );
  });
});
