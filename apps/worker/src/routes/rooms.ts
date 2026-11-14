import {
  COMPAT_CHAT_THRESHOLD,
  COMPAT_STRONG_THRESHOLD,
  ImageValidationError,
  isOnboardingComplete,
  type MatchTier,
  myRoomsResponseSchema,
  PHOTO_MAX_BYTES,
  ROOM_PHOTO_MAX_COUNT,
  ROOMS_LIMIT,
  roomCreateSchema,
  roomDetailsSchema,
  roomListItemSchema,
  roomPatchSchema,
  roomPhotoIndexSchema,
  roomsResponseSchema,
  sanitizeImage,
  scoreCompatibility,
} from "@hearth/shared";
import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import { Hono } from "hono";

import { createDb } from "../db/client";
import { profiles, rooms, users } from "../db/schema";
import { asLifeStage, asSeeking } from "../lib/academic-code";
import { toProfileSnapshot } from "../lib/profiles";
import { apiError, readJsonBody } from "../lib/responses";
import { nowDate } from "../lib/time";
import { requireSession } from "../middleware/session";
import type { AppEnv } from "../types";

// Fixed ".jpg" suffix keeps GET keys deterministic; the true content type
// always travels in the object's httpMetadata, so the extension is cosmetic.
const photoKey = (roomId: string, index: number) => `rooms/${roomId}/${index}.jpg`;

function tierForScore(score: number): MatchTier {
  if (score >= COMPAT_STRONG_THRESHOLD) return "strong-overlap";
  if (score >= COMPAT_CHAT_THRESHOLD) return "worth-a-chat";
  return "likely-friction";
}

const roomsRoute = new Hono<AppEnv>();

roomsRoute.use("*", requireSession);

/** Listing row → response item. `score` is null on self-facing payloads. */
function toListItem(
  room: typeof rooms.$inferSelect,
  lister: { userId: string; displayName: string | null; verified: boolean },
  score: number | null,
) {
  return roomListItemSchema.parse({
    id: room.id,
    title: room.title,
    areaLabel: room.areaLabel,
    rentEur: room.rentEur,
    billsIncluded: room.billsIncluded,
    availableFrom: room.availableFrom,
    photoCount: room.photoCount,
    status: room.status,
    createdAt: Math.floor(room.createdAt.getTime() / 1000),
    lister,
    score,
    tier: score === null ? null : tierForScore(score),
  });
}

type ProfileRow = typeof profiles.$inferSelect;

/** Self-facing details payload; requires the caller's own profile row. */
function toSelfDetails(
  room: typeof rooms.$inferSelect,
  meRow: ProfileRow,
  meAnswers: ReturnType<typeof toProfileSnapshot>["lifestyle"],
) {
  if (!meAnswers) {
    throw new Error("lister profile has no lifestyle answers");
  }
  return roomDetailsSchema.parse({
    ...toListItem(
      room,
      {
        userId: meRow.userId,
        displayName: meRow.displayName,
        verified: meRow.academicEmailVerifiedAt !== null,
      },
      null,
    ),
    description: room.description,
    areaLat: room.areaLat,
    areaLng: room.areaLng,
    lifestyleAnswers: meAnswers.answers,
    lifeStage: asLifeStage(meRow.lifeStage),
    seeking: asSeeking(meRow.seeking),
    budgetMin: meRow.budgetMin,
    budgetMax: meRow.budgetMax,
    moveInFrom: meRow.moveInFrom,
    moveInTo: meRow.moveInTo,
    campusId: meRow.campusId,
    updatedAt: Math.floor(room.updatedAt.getTime() / 1000),
  });
}

roomsRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const meRow = await db.select().from(profiles).where(eq(profiles.userId, id)).get();
  const meSnapshot = meRow ? toProfileSnapshot(meRow) : null;
  if (!meSnapshot || !isOnboardingComplete(meSnapshot) || !meSnapshot.lifestyle) {
    return apiError(c, 403, "forbidden", "Finish your profile to browse rooms.");
  }

  // Browse is not eligibility-filtered (M5.md): every complete member sees
  // every active listing; the score chip is informational only.
  const rows = await db
    .select({ room: rooms, profile: profiles, user: users })
    .from(rooms)
    .innerJoin(profiles, eq(rooms.listerId, profiles.userId))
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(
      and(
        eq(rooms.status, "active"),
        ne(rooms.listerId, id),
        isNotNull(profiles.lifestyleJson),
        isNotNull(profiles.onboardingCompletedAt),
        eq(users.status, "active"),
      ),
    )
    // Secondary id sort keeps the feed deterministic when listings share a
    // timestamp (e.g. seeds written in one batch).
    .orderBy(desc(rooms.createdAt), asc(rooms.id))
    .limit(ROOMS_LIMIT);

  // Narrowed once here: TS control flow does not follow const narrowing
  // into the closure below.
  const myAnswers = meSnapshot.lifestyle.answers;

  const items = rows.flatMap((row) => {
    // Defensive re-check, mirroring the matches route: completeness is
    // guaranteed before scoring against the lister's answers.
    const snapshot = toProfileSnapshot(row.profile);
    if (!isOnboardingComplete(snapshot) || !snapshot.lifestyle) {
      return [];
    }
    const { score } = scoreCompatibility(myAnswers, snapshot.lifestyle.answers);
    return [
      toListItem(
        row.room,
        {
          userId: row.profile.userId,
          displayName: row.profile.displayName,
          verified: row.profile.academicEmailVerifiedAt !== null,
        },
        score,
      ),
    ];
  });

  return c.json(roomsResponseSchema.parse({ rooms: items }), 200, {
    "cache-control": "no-store",
  });
});

roomsRoute.post("/", async (c) => {
  const parsed = roomCreateSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) {
    return apiError(c, 400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid listing.");
  }

  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const meRow = await db.select().from(profiles).where(eq(profiles.userId, id)).get();
  const meSnapshot = meRow ? toProfileSnapshot(meRow) : null;
  if (!meRow || !meSnapshot || !isOnboardingComplete(meSnapshot) || !meSnapshot.lifestyle) {
    return apiError(c, 403, "forbidden", "Finish your profile to list a room.");
  }

  const existing = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.listerId, id), eq(rooms.status, "active")))
    .get();
  if (existing) {
    return apiError(
      c,
      409,
      "conflict",
      "You already have an active listing. Withdraw it to create a new one.",
    );
  }

  const now = nowDate();
  const inserted = await db
    .insert(rooms)
    .values({
      id: crypto.randomUUID(),
      listerId: id,
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return c.json(toSelfDetails(inserted, meRow, meSnapshot.lifestyle), 201, {
    "cache-control": "no-store",
  });
});

roomsRoute.get("/mine", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const meRow = await db.select().from(profiles).where(eq(profiles.userId, id)).get();
  if (!meRow) {
    return c.json(myRoomsResponseSchema.parse({ rooms: [] }), 200, {
      "cache-control": "no-store",
    });
  }

  const rows = await db
    .select()
    .from(rooms)
    .where(eq(rooms.listerId, id))
    .orderBy(desc(rooms.createdAt));

  const items = rows.map((room) =>
    toListItem(
      room,
      {
        userId: id,
        displayName: meRow.displayName,
        verified: meRow.academicEmailVerifiedAt !== null,
      },
      null,
    ),
  );

  return c.json(myRoomsResponseSchema.parse({ rooms: items }), 200, {
    "cache-control": "no-store",
  });
});

roomsRoute.get("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const row = await db
    .select({ room: rooms, profile: profiles, user: users })
    .from(rooms)
    .innerJoin(profiles, eq(rooms.listerId, profiles.userId))
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(eq(rooms.id, c.req.param("id")))
    .get();

  if (!row) {
    return apiError(c, 404, "not_found", "No such listing.");
  }

  const isOwner = row.room.listerId === id;
  const listerSnapshot = toProfileSnapshot(row.profile);

  // Withdrawn listings stay visible to their owner only; listings from
  // deactivated members disappear for everyone else.
  if (
    (!isOwner && row.room.status !== "active") ||
    (!isOwner && (row.user.status !== "active" || row.user.deletedAt !== null)) ||
    !listerSnapshot.lifestyle
  ) {
    return apiError(c, 404, "not_found", "No such listing.");
  }

  const meRow = await db.select().from(profiles).where(eq(profiles.userId, id)).get();
  const meSnapshot = meRow ? toProfileSnapshot(meRow) : null;
  const score =
    !isOwner && meSnapshot?.lifestyle
      ? scoreCompatibility(meSnapshot.lifestyle.answers, listerSnapshot.lifestyle.answers).score
      : null;

  const details = roomDetailsSchema.parse({
    ...toListItem(
      row.room,
      {
        userId: row.profile.userId,
        displayName: row.profile.displayName,
        verified: row.profile.academicEmailVerifiedAt !== null,
      },
      score,
    ),
    description: row.room.description,
    areaLat: row.room.areaLat,
    areaLng: row.room.areaLng,
    lifestyleAnswers: listerSnapshot.lifestyle.answers,
    lifeStage: listerSnapshot.lifeStage,
    seeking: listerSnapshot.seeking,
    budgetMin: listerSnapshot.budgetMin,
    budgetMax: listerSnapshot.budgetMax,
    moveInFrom: listerSnapshot.moveInFrom,
    moveInTo: listerSnapshot.moveInTo,
    campusId: listerSnapshot.campusId,
    updatedAt: Math.floor(row.room.updatedAt.getTime() / 1000),
  });

  return c.json(details, 200, { "cache-control": "no-store" });
});

roomsRoute.patch("/:id", async (c) => {
  const parsed = roomPatchSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) {
    return apiError(c, 400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid update.");
  }

  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, c.req.param("id")))
    .get();
  if (!room || room.listerId !== id) {
    return apiError(c, 404, "not_found", "No such listing.");
  }

  // Reactivating a withdrawn listing must respect the one-active rule.
  if (parsed.data.status === "active" && room.status !== "active") {
    const other = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.listerId, id), eq(rooms.status, "active"), ne(rooms.id, room.id)))
      .get();
    if (other) {
      return apiError(
        c,
        409,
        "conflict",
        "You already have an active listing. Withdraw it to reactivate this one.",
      );
    }
  }

  const meRow = await db.select().from(profiles).where(eq(profiles.userId, id)).get();
  const meSnapshot = meRow ? toProfileSnapshot(meRow) : null;
  if (!meRow || !meSnapshot?.lifestyle) {
    return apiError(c, 404, "not_found", "No such listing.");
  }

  const updated = await db
    .update(rooms)
    .set({ ...parsed.data, updatedAt: nowDate() })
    .where(eq(rooms.id, room.id))
    .returning()
    .get();
  // A concurrent delete between update and read leaves nothing to return.
  if (!updated) {
    return apiError(c, 404, "not_found", "No such listing.");
  }

  return c.json(toSelfDetails(updated, meRow, meSnapshot.lifestyle), 200, {
    "cache-control": "no-store",
  });
});

roomsRoute.delete("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, c.req.param("id")))
    .get();
  if (!room || room.listerId !== id) {
    return apiError(c, 404, "not_found", "No such listing.");
  }

  // Best-effort photo cleanup; deleting an absent R2 key is a no-op.
  await c.env.PHOTOS.delete([photoKey(room.id, 0), photoKey(room.id, 1), photoKey(room.id, 2)]);
  await db.delete(rooms).where(eq(rooms.id, room.id));

  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
});

roomsRoute.post("/:id/photos", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, c.req.param("id")))
    .get();
  if (!room || room.listerId !== id) {
    return apiError(c, 404, "not_found", "No such listing.");
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return apiError(c, 400, "bad_request", "Send the photos as multipart form data.");
  }

  const files = form.getAll("photos").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return apiError(c, 400, "bad_request", "Send at least one photo.");
  }
  if (room.photoCount + files.length > ROOM_PHOTO_MAX_COUNT) {
    return apiError(
      c,
      400,
      "bad_request",
      `A listing can have at most ${ROOM_PHOTO_MAX_COUNT} photos.`,
    );
  }

  // Sniff and sanitize every file before anything reaches R2, so a bad
  // file can never leave a half-uploaded listing behind.
  const sanitizedPhotos: { bytes: Uint8Array; contentType: string }[] = [];
  for (const file of files) {
    if (file.size > PHOTO_MAX_BYTES) {
      return apiError(c, 413, "payload_too_large", "Each image must be 5 MB or smaller.");
    }
    try {
      const sanitized = sanitizeImage(new Uint8Array(await file.arrayBuffer()));
      sanitizedPhotos.push({ bytes: sanitized.bytes, contentType: sanitized.contentType });
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
  }

  const baseIndex = room.photoCount;
  const puts = sanitizedPhotos.map((photo, i) => ({
    key: photoKey(room.id, baseIndex + i),
    photo,
  }));

  for (const put of puts) {
    await c.env.PHOTOS.put(put.key, put.photo.bytes, {
      httpMetadata: {
        contentType: put.photo.contentType,
        cacheControl: "private, max-age=31536000, immutable",
      },
    });
  }

  const now = nowDate();
  try {
    await db
      .update(rooms)
      .set({ photoCount: baseIndex + sanitizedPhotos.length, updatedAt: now })
      .where(eq(rooms.id, room.id));
  } catch (error) {
    await c.env.PHOTOS.delete(puts.map((put) => put.key));
    throw error;
  }

  const meRow = await db.select().from(profiles).where(eq(profiles.userId, id)).get();
  const meSnapshot = meRow ? toProfileSnapshot(meRow) : null;
  if (!meRow || !meSnapshot?.lifestyle) {
    return apiError(c, 404, "not_found", "No such listing.");
  }

  const updated = await db.select().from(rooms).where(eq(rooms.id, room.id)).get();
  if (!updated) {
    return apiError(c, 404, "not_found", "No such listing.");
  }

  return c.json(toSelfDetails(updated, meRow, meSnapshot.lifestyle), 201, {
    "cache-control": "no-store",
  });
});

roomsRoute.get("/:id/photos/:n", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const parsed = roomPhotoIndexSchema.safeParse(Number(c.req.param("n")));
  if (!parsed.success) {
    return apiError(c, 400, "bad_request", "No such photo.");
  }

  const row = await db
    .select({ room: rooms, user: users })
    .from(rooms)
    .innerJoin(users, eq(rooms.listerId, users.id))
    .where(eq(rooms.id, c.req.param("id")))
    .get();

  if (
    !row ||
    (row.room.listerId !== id &&
      (row.room.status !== "active" || row.user.status !== "active" || row.user.deletedAt !== null))
  ) {
    return apiError(c, 404, "not_found", "No such photo.");
  }

  const object = await c.env.PHOTOS.get(photoKey(row.room.id, parsed.data));
  if (!object) {
    return apiError(c, 404, "not_found", "No such photo.");
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

roomsRoute.delete("/:id/photos/:n", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const parsed = roomPhotoIndexSchema.safeParse(Number(c.req.param("n")));
  if (!parsed.success) {
    return apiError(c, 400, "bad_request", "No such photo.");
  }

  const room = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, c.req.param("id")))
    .get();
  if (!room || room.listerId !== id) {
    return apiError(c, 404, "not_found", "No such photo.");
  }

  const index = parsed.data;
  if (index >= room.photoCount) {
    return apiError(c, 404, "not_found", "No such photo.");
  }

  await c.env.PHOTOS.delete(photoKey(room.id, index));

  // Slots shift down like an array so photos stay contiguous 0..count-1.
  for (let i = index + 1; i < room.photoCount; i += 1) {
    const object = await c.env.PHOTOS.get(photoKey(room.id, i));
    if (object) {
      await c.env.PHOTOS.put(photoKey(room.id, i - 1), await object.arrayBuffer(), {
        ...(object.httpMetadata ? { httpMetadata: object.httpMetadata } : {}),
      });
      await c.env.PHOTOS.delete(photoKey(room.id, i));
    }
  }

  const updated = await db
    .update(rooms)
    .set({ photoCount: room.photoCount - 1, updatedAt: nowDate() })
    .where(eq(rooms.id, room.id))
    .returning()
    .get();
  // A concurrent delete between update and read leaves nothing to return.
  if (!updated) {
    return apiError(c, 404, "not_found", "No such photo.");
  }

  const meRow = await db.select().from(profiles).where(eq(profiles.userId, id)).get();
  const meSnapshot = meRow ? toProfileSnapshot(meRow) : null;
  if (!meRow || !meSnapshot?.lifestyle) {
    return apiError(c, 404, "not_found", "No such photo.");
  }

  return c.json(toSelfDetails(updated, meRow, meSnapshot.lifestyle), 200, {
    "cache-control": "no-store",
  });
});

export const roomsRoutes = roomsRoute;
