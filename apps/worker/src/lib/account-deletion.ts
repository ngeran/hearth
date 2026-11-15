import { chatThreadId } from "@hearth/shared";
import { eq, inArray, or } from "drizzle-orm";

import type { Db } from "../db/client";
import {
  academicVerifications,
  account,
  chatThreads,
  passkey,
  profiles,
  pushSubscriptions,
  rooms,
  session,
  users,
  verification,
} from "../db/schema";
import type { Env } from "../env";

export interface AccountDeletionTarget {
  id: string;
  email: string;
}

/**
 * Remove every trace of an account (docs/specs/M1.md, reused by M7 admin
 * delete): R2 objects, chat bodies inside the Durable Objects, then the D1
 * rows. Callers own the audit row and any response/session handling, so this
 * stays a single, replay-safe sequence.
 */
export async function deleteAccountData(
  env: Env,
  db: Db,
  target: AccountDeletionTarget,
): Promise<void> {
  const { id, email } = target;

  const profile = await db.select().from(profiles).where(eq(profiles.userId, id)).get();

  if (profile?.photoKey) {
    await env.PHOTOS.delete(profile.photoKey);
  }

  // Room listing photos live in R2 under rooms/<id>/*; the FK cascade drops
  // the listing rows themselves, so the bytes must be removed explicitly
  // (missing keys delete as a no-op).
  const myRooms = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.listerId, id));
  for (const room of myRooms) {
    await env.PHOTOS.delete([
      `rooms/${room.id}/0.jpg`,
      `rooms/${room.id}/1.jpg`,
      `rooms/${room.id}/2.jpg`,
    ]);
  }

  // Purge every conversation body from the ChatRoom Durable Objects before
  // the D1 cleanup removes the thread rows (the FK cascade only drops
  // metadata). Bodies live solely inside the DOs, so deletion must reach
  // each one individually.
  const threads = await db
    .select()
    .from(chatThreads)
    .where(or(eq(chatThreads.userLow, id), eq(chatThreads.userHigh, id)));
  for (const thread of threads) {
    const peerId = thread.userLow === id ? thread.userHigh : thread.userLow;
    const stub = env.CHAT.get(env.CHAT.idFromName(chatThreadId(id, peerId)));
    await stub.fetch("https://chat-room/purge", {
      method: "POST",
      headers: { "x-hearth-user-id": id, "x-hearth-peer-id": peerId },
    });
  }

  const otpIdentifiers = [
    "sign-in-otp",
    "email-verification-otp",
    "forget-password-otp",
    "change-email-otp",
  ].map((prefix) => `${prefix}-${email}`);

  await db.delete(verification).where(inArray(verification.identifier, otpIdentifiers));
  await db.delete(academicVerifications).where(eq(academicVerifications.userId, id));
  await db.delete(passkey).where(eq(passkey.userId, id));
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, id));
  await db.delete(account).where(eq(account.userId, id));
  await db.delete(session).where(eq(session.userId, id));
  await db.delete(profiles).where(eq(profiles.userId, id));
  await db.delete(users).where(eq(users.id, id));
}
