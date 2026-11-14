import {
  ACADEMIC_CODE_HOURLY_LIMIT,
  ACADEMIC_CODE_HOURLY_WINDOW_SECONDS,
  ACADEMIC_CODE_MAX_ATTEMPTS,
  ACADEMIC_CODE_RESEND_COOLDOWN_SECONDS,
  ACADEMIC_CODE_TTL_SECONDS,
  academicEmailRequestSchema,
  academicEmailVerifySchema,
  academicVerificationResponseSchema,
  chatThreadId,
  deleteAccountSchema,
  exportResponseSchema,
  ImageValidationError,
  PHOTO_MAX_BYTES,
  photoUploadResponseSchema,
  profilePatchSchema,
  sanitizeImage,
} from "@hearth/shared";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { Hono } from "hono";

import { createDb, type Db } from "../db/client";
import {
  academicVerifications,
  account,
  auditLog,
  chatThreads,
  passkey,
  profiles,
  rooms,
  session,
  users,
  verification,
} from "../db/schema";
import {
  constantTimeEqual,
  generateAcademicCode,
  hashAcademicCode,
  preferredLanguageFromHeader,
} from "../lib/academic-code";
import {
  applyProfilePatch,
  ensureProfile,
  getMeResponse,
  ProfileValidationError,
  toProfileSnapshot,
  toUserResponse,
} from "../lib/profiles";
import { apiError, readJsonBody } from "../lib/responses";
import { fromUnixSeconds, nowDate, toUnixSeconds } from "../lib/time";
import { academicEmail as academicEmailMessage, createMailer } from "../mailer";
import { requireSession } from "../middleware/session";
import type { AppEnv } from "../types";

const me = new Hono<AppEnv>();

me.use("*", requireSession);

function userId(c: { get: (key: "user") => { id: string } }): string {
  return c.get("user").id;
}

function clearSessionCookies(headers: Headers): void {
  const cookies = [
    { name: "better-auth.session_token", secure: false },
    { name: "__Secure-better-auth.session_token", secure: true },
    { name: "better-auth.dont_remember", secure: false },
    { name: "__Secure-better-auth.dont_remember", secure: true },
  ];

  for (const cookie of cookies) {
    headers.append(
      "set-cookie",
      `${cookie.name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
        cookie.secure ? "; Secure" : ""
      }`,
    );
  }
}

async function latestChallenge(db: Db, id: string) {
  return db
    .select()
    .from(academicVerifications)
    .where(eq(academicVerifications.userId, id))
    .orderBy(desc(academicVerifications.createdAt))
    .get();
}

me.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const response = await getMeResponse(db, userId(c), c.req.header("accept-language"));

  return c.json(response);
});

me.put("/", async (c) => {
  const body = await readJsonBody(c);

  if (body === null) {
    return apiError(c, 400, "bad_request", "Send a JSON object.");
  }

  const parsed = profilePatchSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(
      c,
      400,
      "bad_request",
      parsed.error.issues[0]?.message ?? "Check the profile details.",
    );
  }

  const db = createDb(c.env.DB);

  try {
    const response = await applyProfilePatch(
      db,
      userId(c),
      parsed.data,
      c.req.header("accept-language"),
    );

    return c.json(response);
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return apiError(c, 400, "bad_request", error.message);
    }

    throw error;
  }
});

me.post("/photo", async (c) => {
  const declaredLength = Number.parseInt(c.req.header("content-length") ?? "", 10);

  if (Number.isFinite(declaredLength) && declaredLength > PHOTO_MAX_BYTES) {
    return apiError(c, 413, "payload_too_large", "The image must be 5 MB or smaller.");
  }

  let sanitized: ReturnType<typeof sanitizeImage>;

  try {
    sanitized = sanitizeImage(new Uint8Array(await c.req.arrayBuffer()));
  } catch (error) {
    if (error instanceof ImageValidationError) {
      if (error.code === "too_large") {
        return apiError(c, 413, "payload_too_large", error.message);
      }

      if (error.code === "empty") {
        return apiError(c, 400, "bad_request", error.message);
      }

      return apiError(c, 415, "unsupported_media_type", error.message);
    }

    throw error;
  }

  const db = createDb(c.env.DB);
  const id = userId(c);
  const current = await ensureProfile(db, id, preferredLanguageFromHeader(undefined));
  const extension = sanitized.contentType === "image/jpeg" ? "jpg" : "png";
  const key = `profile-photos/${id}/${crypto.randomUUID()}.${extension}`;

  await c.env.PHOTOS.put(key, sanitized.bytes, {
    httpMetadata: {
      contentType: sanitized.contentType,
      cacheControl: "private, max-age=31536000, immutable",
    },
  });

  const now = nowDate();

  try {
    await db.update(profiles).set({ photoKey: key, updatedAt: now }).where(eq(profiles.userId, id));
  } catch (error) {
    await c.env.PHOTOS.delete(key);
    throw error;
  }

  if (current.photoKey) {
    await c.env.PHOTOS.delete(current.photoKey);
  }

  return c.json(
    photoUploadResponseSchema.parse({
      photoUrl: `/api/v1/me/photo?v=${toUnixSeconds(now)}`,
    }),
    201,
  );
});

me.get("/photo", async (c) => {
  const db = createDb(c.env.DB);
  const profile = await ensureProfile(
    db,
    userId(c),
    preferredLanguageFromHeader(c.req.header("accept-language")),
  );

  if (!profile.photoKey) {
    return apiError(c, 404, "not_found", "There is no profile photo.");
  }

  const object = await c.env.PHOTOS.get(profile.photoKey);

  if (!object) {
    return apiError(c, 404, "not_found", "There is no profile photo.");
  }

  if (c.req.header("if-none-match") === object.httpEtag) {
    return new Response(null, { status: 304, headers: { etag: object.httpEtag } });
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "content-length": String(object.size),
      "cache-control": "private, max-age=0, must-revalidate",
      etag: object.httpEtag,
      "x-content-type-options": "nosniff",
    },
  });
});

me.delete("/photo", async (c) => {
  const db = createDb(c.env.DB);
  const id = userId(c);
  const profile = await ensureProfile(db, id, preferredLanguageFromHeader(undefined));

  if (profile.photoKey) {
    await c.env.PHOTOS.delete(profile.photoKey);
    await db
      .update(profiles)
      .set({ photoKey: null, updatedAt: nowDate() })
      .where(eq(profiles.userId, id));
  }

  return new Response(null, { status: 204 });
});

me.post("/academic-email", async (c) => {
  const body = await readJsonBody(c);

  if (body === null) {
    return apiError(c, 400, "bad_request", "Send a JSON object.");
  }

  const parsed = academicEmailRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(
      c,
      400,
      "bad_request",
      parsed.error.issues[0]?.message ?? "Enter a valid email address.",
    );
  }

  const db = createDb(c.env.DB);
  const id = userId(c);
  const email = parsed.data.email.toLowerCase();
  const now = nowDate();
  const latest = await latestChallenge(db, id);

  if (latest) {
    const elapsed = toUnixSeconds(now) - toUnixSeconds(latest.lastSentAt);

    if (elapsed < ACADEMIC_CODE_RESEND_COOLDOWN_SECONDS) {
      const remaining = ACADEMIC_CODE_RESEND_COOLDOWN_SECONDS - elapsed;
      c.header("retry-after", String(remaining));
      return apiError(c, 429, "rate_limited", "Wait a minute before requesting another code.");
    }
  }

  // Cap outbound verification emails per user so one account cannot be used
  // to email-bomb arbitrary addresses. Only challenges whose mail actually
  // went out count: failed sends are deleted below.
  const hourlyCutoff = fromUnixSeconds(toUnixSeconds(now) - ACADEMIC_CODE_HOURLY_WINDOW_SECONDS);
  const recentChallenges = await db
    .select({ createdAt: academicVerifications.createdAt })
    .from(academicVerifications)
    .where(
      and(eq(academicVerifications.userId, id), gt(academicVerifications.createdAt, hourlyCutoff)),
    )
    .orderBy(desc(academicVerifications.createdAt));

  if (recentChallenges.length >= ACADEMIC_CODE_HOURLY_LIMIT) {
    const oldest = recentChallenges.at(-1);
    const elapsedSinceOldest = oldest
      ? toUnixSeconds(now) - toUnixSeconds(oldest.createdAt)
      : ACADEMIC_CODE_HOURLY_WINDOW_SECONDS;
    const remaining = Math.max(1, ACADEMIC_CODE_HOURLY_WINDOW_SECONDS - elapsedSinceOldest);
    c.header("retry-after", String(remaining));
    return apiError(c, 429, "hourly_limit", "Too many codes requested this hour. Try again later.");
  }

  const code = generateAcademicCode(c.env);
  const codeHash = await hashAcademicCode(c.env.BETTER_AUTH_SECRET, id, email, code);
  const challengeId = crypto.randomUUID();

  await db
    .update(academicVerifications)
    .set({ consumedAt: now })
    .where(and(eq(academicVerifications.userId, id), isNull(academicVerifications.consumedAt)));

  try {
    await db.insert(academicVerifications).values({
      id: challengeId,
      userId: id,
      email,
      codeHash,
      expiresAt: fromUnixSeconds(toUnixSeconds(now) + ACADEMIC_CODE_TTL_SECONDS),
      attempts: 0,
      lastSentAt: now,
      createdAt: now,
    });
  } catch (error) {
    // The partial unique index (migration 0002) makes a concurrent double
    // request fail here instead of leaving two active challenges.
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return apiError(c, 429, "rate_limited", "Wait a minute before requesting another code.");
    }

    throw error;
  }

  try {
    await createMailer(c.env).send(academicEmailMessage(email, code));
  } catch {
    await db.delete(academicVerifications).where(eq(academicVerifications.id, challengeId));
    return apiError(c, 502, "service_unavailable", "We could not send the email. Try again.");
  }

  return c.json(academicVerificationResponseSchema.parse({ email, verifiedAt: null }), 202);
});

me.post("/academic-email/verify", async (c) => {
  const body = await readJsonBody(c);

  if (body === null) {
    return apiError(c, 400, "bad_request", "Send a JSON object.");
  }

  const parsed = academicEmailVerifySchema.safeParse(body);

  if (!parsed.success) {
    return apiError(
      c,
      400,
      "bad_request",
      parsed.error.issues[0]?.message ?? "Enter the code from your email.",
    );
  }

  const db = createDb(c.env.DB);
  const id = userId(c);
  const challenge = await db
    .select()
    .from(academicVerifications)
    .where(and(eq(academicVerifications.userId, id), isNull(academicVerifications.consumedAt)))
    .orderBy(desc(academicVerifications.createdAt))
    .get();

  if (!challenge) {
    return apiError(c, 400, "bad_request", "Request a new code first.");
  }

  const now = nowDate();

  if (challenge.expiresAt.getTime() <= now.getTime()) {
    await db
      .update(academicVerifications)
      .set({ consumedAt: now })
      .where(eq(academicVerifications.id, challenge.id));
    return apiError(c, 400, "bad_request", "That code has expired. Request a new one.");
  }

  if (challenge.attempts >= ACADEMIC_CODE_MAX_ATTEMPTS) {
    return apiError(c, 429, "rate_limited", "Too many attempts. Request a new code.");
  }

  const expected = await hashAcademicCode(
    c.env.BETTER_AUTH_SECRET,
    id,
    challenge.email,
    parsed.data.code,
  );

  if (!constantTimeEqual(expected, challenge.codeHash)) {
    const attempts = challenge.attempts + 1;

    await db
      .update(academicVerifications)
      .set({
        attempts,
        consumedAt: attempts >= ACADEMIC_CODE_MAX_ATTEMPTS ? now : challenge.consumedAt,
      })
      .where(eq(academicVerifications.id, challenge.id));

    return apiError(c, 400, "bad_request", "That code is not correct.");
  }

  await db
    .update(academicVerifications)
    .set({ consumedAt: now })
    .where(eq(academicVerifications.id, challenge.id));

  await ensureProfile(db, id, preferredLanguageFromHeader(c.req.header("accept-language")));
  await db
    .update(profiles)
    .set({ academicEmail: challenge.email, academicEmailVerifiedAt: now })
    .where(eq(profiles.userId, id));

  return c.json(
    academicVerificationResponseSchema.parse({
      email: challenge.email,
      verifiedAt: toUnixSeconds(now),
    }),
  );
});

me.get("/export", async (c) => {
  const db = createDb(c.env.DB);
  const id = userId(c);
  const user = await db.select().from(users).where(eq(users.id, id)).get();

  if (!user) {
    return apiError(c, 401, "unauthorized", "Sign in to continue.");
  }

  const profile = await ensureProfile(
    db,
    id,
    preferredLanguageFromHeader(c.req.header("accept-language")),
  );
  const sessionRows = await db
    .select({
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(eq(session.userId, id))
    .orderBy(desc(session.createdAt));
  const passkeyRows = await db
    .select({
      name: passkey.name,
      createdAt: passkey.createdAt,
      deviceType: passkey.deviceType,
    })
    .from(passkey)
    .where(eq(passkey.userId, id))
    .orderBy(desc(passkey.createdAt));

  const payload = exportResponseSchema.parse({
    exportedAt: toUnixSeconds(nowDate()),
    user: toUserResponse(user),
    profile: toProfileSnapshot(profile),
    sessions: sessionRows.map((row) => ({
      createdAt: toUnixSeconds(row.createdAt),
      expiresAt: toUnixSeconds(row.expiresAt),
      userAgent: row.userAgent,
    })),
    passkeys: passkeyRows.map((row) => ({
      name: row.name,
      createdAt: row.createdAt ? toUnixSeconds(row.createdAt) : 0,
      deviceType: row.deviceType,
    })),
    academicVerification: profile.academicEmail
      ? {
          email: profile.academicEmail,
          verifiedAt: profile.academicEmailVerifiedAt
            ? toUnixSeconds(profile.academicEmailVerifiedAt)
            : null,
        }
      : null,
  });

  return c.json(payload, 200, {
    "cache-control": "no-store",
    "content-disposition": `attachment; filename="hearth-export-${toUnixSeconds(nowDate())}.json"`,
  });
});

me.delete("/", async (c) => {
  const body = await readJsonBody(c);

  if (body === null) {
    return apiError(c, 400, "bad_request", "Send a JSON object.");
  }

  const parsed = deleteAccountSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(c, 400, "bad_request", "Type DELETE to confirm account deletion.");
  }

  const db = createDb(c.env.DB);
  const id = userId(c);
  const user = await db.select().from(users).where(eq(users.id, id)).get();

  if (!user) {
    return apiError(c, 401, "unauthorized", "Sign in to continue.");
  }

  const profile = await db.select().from(profiles).where(eq(profiles.userId, id)).get();

  if (profile?.photoKey) {
    await c.env.PHOTOS.delete(profile.photoKey);
  }

  // Room listing photos live in R2 under rooms/<id>/*; the FK cascade drops
  // the listing rows themselves, so the bytes must be removed explicitly
  // (missing keys delete as a no-op).
  const myRooms = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.listerId, id));
  for (const room of myRooms) {
    await c.env.PHOTOS.delete([
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
    const stub = c.env.CHAT.get(c.env.CHAT.idFromName(chatThreadId(id, peerId)));
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
  ].map((prefix) => `${prefix}-${user.email}`);

  await db.delete(verification).where(inArray(verification.identifier, otpIdentifiers));
  await db.delete(academicVerifications).where(eq(academicVerifications.userId, id));
  await db.delete(passkey).where(eq(passkey.userId, id));
  await db.delete(account).where(eq(account.userId, id));
  await db.delete(session).where(eq(session.userId, id));
  await db.delete(profiles).where(eq(profiles.userId, id));
  await db.delete(users).where(eq(users.id, id));

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorUserId: null,
    event: "account.deleted",
    metadata: JSON.stringify({ reason: "user_requested" }),
    createdAt: nowDate(),
  });

  const headers = new Headers({ "cache-control": "no-store" });
  clearSessionCookies(headers);

  return new Response(null, { status: 204, headers });
});

export const meRoutes = me;
