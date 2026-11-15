import {
  ADMIN_ERROR_RETENTION_DAYS,
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_MAX_LIMIT,
  ADMIN_MATCH_WINDOW_DAYS,
  ADMIN_ONLINE_WINDOW_SECONDS,
  adminDeleteRoomResponseSchema,
  adminDeleteUserResponseSchema,
  adminDeleteUserSchema,
  adminErrorsResponseSchema,
  adminOverviewSchema,
  adminRevokeSessionsResponseSchema,
  adminRoomsResponseSchema,
  adminUserDetailSchema,
  adminUsersResponseSchema,
  ROOM_PHOTO_MAX_COUNT,
} from "@hearth/shared";
import { and, desc, eq, gte, inArray, isNotNull, like, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { createDb, type Db } from "../db/client";
import {
  auditLog,
  chatThreads,
  errorEvents,
  matchEvents,
  profiles,
  pushSubscriptions,
  rooms,
  session,
  users,
} from "../db/schema";
import { deleteAccountData } from "../lib/account-deletion";
import { requireAdmin } from "../lib/admin";
import { apiError, readJsonBody } from "../lib/responses";
import { fromUnixSeconds, nowDate, toUnixSeconds } from "../lib/time";
import type { AppEnv } from "../types";

const admin = new Hono<AppEnv>();

admin.use("*", requireAdmin);

const SECONDS_PER_DAY = 24 * 60 * 60;

/** All admin lists share the same bounded pagination contract. */
const offsetSchema = z.coerce.number().int().min(0).max(100_000).default(0);
const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(ADMIN_LIST_MAX_LIMIT)
  .default(ADMIN_LIST_DEFAULT_LIMIT);

const usersQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
  offset: offsetSchema,
  limit: limitSchema,
});

const errorsQuerySchema = z.object({
  route: z.string().trim().max(120).optional(),
  status: z.coerce.number().int().min(100).max(599).optional(),
  offset: offsetSchema,
  limit: limitSchema,
});

const roomsQuerySchema = z.object({
  status: z.enum(["active", "withdrawn"]).optional(),
  query: z.string().trim().max(100).optional(),
  offset: offsetSchema,
  limit: limitSchema,
});

function adminId(c: { get: (key: "user") => { id: string } }): string {
  return c.get("user").id;
}

function nowSeconds(): number {
  return toUnixSeconds(nowDate());
}

function startOfUtcDay(seconds: number): number {
  return Math.floor(seconds / SECONDS_PER_DAY) * SECONDS_PER_DAY;
}

/** `%`/`_` only broaden an admin-only search; the value stays parameterized. */
function containsPattern(term: string): string {
  return `%${term}%`;
}

async function writeAudit(
  db: Db,
  actorUserId: string,
  event: string,
  metadata: Record<string, string>,
): Promise<void> {
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    actorUserId,
    event,
    metadata: JSON.stringify(metadata),
    createdAt: nowDate(),
  });
}

function parseQuery<T>(schema: z.ZodType<T>, raw: Record<string, string>): T | null {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

admin.get("/overview", async (c) => {
  const db = createDb(c.env.DB);
  const now = nowSeconds();
  const today = startOfUtcDay(now);
  const weekAgo = now - ADMIN_MATCH_WINDOW_DAYS * SECONDS_PER_DAY;
  const monthAgo = now - 30 * SECONDS_PER_DAY;
  const onlineCutoff = now - ADMIN_ONLINE_WINDOW_SECONDS;
  const dayAgo = now - SECONDS_PER_DAY;

  // Presence and registration buckets are one aggregate pass over users; the
  // CASE sums avoid five round trips on a table that stays small.
  const userTotals = await db
    .select({
      total: sql<number>`count(*)`,
      online: sql<number>`coalesce(sum(case when ${users.lastSeenAt} >= ${onlineCutoff} then 1 else 0 end), 0)`,
      registeredToday: sql<number>`coalesce(sum(case when ${users.createdAt} >= ${today} then 1 else 0 end), 0)`,
      registered7d: sql<number>`coalesce(sum(case when ${users.createdAt} >= ${weekAgo} then 1 else 0 end), 0)`,
      registered30d: sql<number>`coalesce(sum(case when ${users.createdAt} >= ${monthAgo} then 1 else 0 end), 0)`,
    })
    .from(users)
    .get();

  const completeProfiles = await db
    .select({ total: sql<number>`count(*)` })
    .from(profiles)
    .where(isNotNull(profiles.onboardingCompletedAt))
    .get();

  const academicVerified = await db
    .select({ total: sql<number>`count(*)` })
    .from(profiles)
    .where(isNotNull(profiles.academicEmailVerifiedAt))
    .get();

  const activeRooms = await db
    .select({ total: sql<number>`count(*)` })
    .from(rooms)
    .where(eq(rooms.status, "active"))
    .get();

  const totalRooms = await db.select({ total: sql<number>`count(*)` }).from(rooms).get();

  const impressions7d = await db
    .select({ total: sql<number>`count(*)` })
    .from(matchEvents)
    .where(gte(matchEvents.createdAt, weekAgo))
    .get();

  const successfulPairs = await db.select({ total: sql<number>`count(*)` }).from(chatThreads).get();

  const activeThreads7d = await db
    .select({ total: sql<number>`count(*)` })
    .from(chatThreads)
    .where(gte(chatThreads.updatedAt, fromUnixSeconds(weekAgo)))
    .get();

  const pushSubscriptionsTotal = await db
    .select({ total: sql<number>`count(*)` })
    .from(pushSubscriptions)
    .get();

  const errorTotals = await db
    .select({
      last24h: sql<number>`coalesce(sum(case when ${errorEvents.createdAt} >= ${dayAgo} then 1 else 0 end), 0)`,
      last7d: sql<number>`coalesce(sum(case when ${errorEvents.createdAt} >= ${weekAgo} then 1 else 0 end), 0)`,
      lastAt: sql<number | null>`max(${errorEvents.createdAt})`,
    })
    .from(errorEvents)
    .get();

  // Pair-level "no thread after a week" needs both directions of the thread
  // key, which Drizzle does not express readably; the statement is parameterized.
  const unsuccessful = await c.env.DB.prepare(
    `SELECT count(*) AS total
       FROM match_events me
      WHERE me.created_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM chat_threads ct
           WHERE (ct.user_low = me.viewer_id AND ct.user_high = me.candidate_id)
              OR (ct.user_low = me.candidate_id AND ct.user_high = me.viewer_id)
        )`,
  )
    .bind(weekAgo)
    .first<{ total: number }>();

  return c.json(
    adminOverviewSchema.parse({
      generatedAt: now,
      users: {
        total: userTotals?.total ?? 0,
        registeredToday: userTotals?.registeredToday ?? 0,
        registered7d: userTotals?.registered7d ?? 0,
        registered30d: userTotals?.registered30d ?? 0,
        online: userTotals?.online ?? 0,
        completeProfiles: completeProfiles?.total ?? 0,
        academicVerified: academicVerified?.total ?? 0,
      },
      rooms: { active: activeRooms?.total ?? 0, total: totalRooms?.total ?? 0 },
      matches: {
        impressions7d: impressions7d?.total ?? 0,
        successfulPairs: successfulPairs?.total ?? 0,
        unsuccessfulPairs: unsuccessful?.total ?? 0,
      },
      chat: { threads: successfulPairs?.total ?? 0, active7d: activeThreads7d?.total ?? 0 },
      push: { subscriptions: pushSubscriptionsTotal?.total ?? 0 },
      errors: {
        last24h: errorTotals?.last24h ?? 0,
        last7d: errorTotals?.last7d ?? 0,
        lastAt: errorTotals?.lastAt ?? null,
      },
    }),
  );
});

admin.get("/users", async (c) => {
  const query = parseQuery(usersQuerySchema, c.req.query());

  if (!query) {
    return apiError(c, 400, "bad_request", "Invalid list parameters.");
  }

  const db = createDb(c.env.DB);
  const search = query.query ? containsPattern(query.query) : null;

  const rows = await db
    .select({ user: users, profile: profiles })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(search ? or(like(users.email, search), like(profiles.displayName, search)) : undefined)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(query.limit + 1)
    .offset(query.offset);

  const page = rows.slice(0, query.limit);

  return c.json(
    adminUsersResponseSchema.parse({
      users: page.map((row) => toAdminUserListItem(row.user, row.profile)),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    }),
  );
});

function toAdminUserListItem(
  user: typeof users.$inferSelect,
  profile: typeof profiles.$inferSelect | null,
) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    displayName: profile?.displayName ?? null,
    status: user.status,
    createdAt: toUnixSeconds(user.createdAt),
    lastSeenAt: user.lastSeenAt,
    onboardingComplete: profile?.onboardingCompletedAt != null,
    academicVerified: profile?.academicEmailVerifiedAt != null,
    deleted: user.deletedAt != null,
  };
}

admin.get("/users/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const user = await db.select().from(users).where(eq(users.id, id)).get();

  if (!user) {
    return apiError(c, 404, "not_found", "The user does not exist.");
  }

  const profile = await db.select().from(profiles).where(eq(profiles.userId, id)).get();

  const [sessionCount, threadCount, roomCount, pushCount] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(session)
      .where(and(eq(session.userId, id), gte(session.expiresAt, nowDate())))
      .get(),
    db
      .select({ total: sql<number>`count(*)` })
      .from(chatThreads)
      .where(or(eq(chatThreads.userLow, id), eq(chatThreads.userHigh, id)))
      .get(),
    db.select({ total: sql<number>`count(*)` }).from(rooms).where(eq(rooms.listerId, id)).get(),
    db
      .select({ total: sql<number>`count(*)` })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, id))
      .get(),
  ]);

  const recentThreads = await db
    .select()
    .from(chatThreads)
    .where(or(eq(chatThreads.userLow, id), eq(chatThreads.userHigh, id)))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(10);

  const peerIds = recentThreads.map((thread) =>
    thread.userLow === id ? thread.userHigh : thread.userLow,
  );
  const peerRows = peerIds.length
    ? await db
        .select({ userId: profiles.userId, displayName: profiles.displayName })
        .from(profiles)
        .where(inArray(profiles.userId, peerIds))
    : [];
  const peerNames = new Map(peerRows.map((row) => [row.userId, row.displayName]));

  const ownRooms = await db
    .select()
    .from(rooms)
    .where(eq(rooms.listerId, id))
    .orderBy(desc(rooms.createdAt))
    .limit(20);

  return c.json(
    adminUserDetailSchema.parse({
      user: toAdminUserListItem(user, profile ?? null),
      profile: profile
        ? {
            displayName: profile.displayName,
            areaLabel: profile.areaLabel,
            seeking: profile.seeking,
            lifeStage: profile.lifeStage,
            budgetMin: profile.budgetMin,
            budgetMax: profile.budgetMax,
            moveInFrom: profile.moveInFrom,
            moveInTo: profile.moveInTo,
            language: profile.language,
            bio: profile.bio,
            ageConfirmed: profile.ageConfirmed,
            onboardingCompletedAt: profile.onboardingCompletedAt
              ? toUnixSeconds(profile.onboardingCompletedAt)
              : null,
            academicEmail: profile.academicEmail,
            academicVerifiedAt: profile.academicEmailVerifiedAt
              ? toUnixSeconds(profile.academicEmailVerifiedAt)
              : null,
          }
        : null,
      counts: {
        sessions: sessionCount?.total ?? 0,
        threads: threadCount?.total ?? 0,
        rooms: roomCount?.total ?? 0,
        pushSubscriptions: pushCount?.total ?? 0,
      },
      recentThreads: recentThreads.map((thread) => {
        const peerId = thread.userLow === id ? thread.userHigh : thread.userLow;
        return {
          peerId,
          peerName: peerNames.get(peerId) ?? null,
          updatedAt: toUnixSeconds(thread.updatedAt),
        };
      }),
      rooms: ownRooms.map((room) => ({
        id: room.id,
        title: room.title,
        status: room.status,
        rentEur: room.rentEur,
        createdAt: toUnixSeconds(room.createdAt),
      })),
    }),
  );
});

admin.post("/users/:id/sessions/revoke", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const user = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).get();

  if (!user) {
    return apiError(c, 404, "not_found", "The user does not exist.");
  }

  const revoked = await db.delete(session).where(eq(session.userId, id)).returning({
    id: session.id,
  });

  await writeAudit(db, adminId(c), "admin.user.sessions.revoke", { targetUserId: id });

  return c.json(adminRevokeSessionsResponseSchema.parse({ revoked: revoked.length }));
});

admin.post("/users/:id/delete", async (c) => {
  const body = await readJsonBody(c);

  if (body === null) {
    return apiError(c, 400, "bad_request", "Send a JSON object.");
  }

  const parsed = adminDeleteUserSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(c, 400, "bad_request", "Type the account email to confirm.");
  }

  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const user = await db.select().from(users).where(eq(users.id, id)).get();

  if (!user) {
    return apiError(c, 404, "not_found", "The user does not exist.");
  }

  if (user.id === adminId(c)) {
    return apiError(c, 400, "bad_request", "You cannot delete your own account here.");
  }

  if (parsed.data.confirmEmail.toLowerCase() !== user.email.trim().toLowerCase()) {
    return apiError(c, 400, "bad_request", "Type the account email to confirm.");
  }

  await deleteAccountData(c.env, db, { id: user.id, email: user.email });
  await writeAudit(db, adminId(c), "admin.user.delete", { targetUserId: user.id });

  return c.json(adminDeleteUserResponseSchema.parse({ deleted: true }));
});

admin.get("/errors", async (c) => {
  const query = parseQuery(errorsQuerySchema, c.req.query());

  if (!query) {
    return apiError(c, 400, "bad_request", "Invalid list parameters.");
  }

  const db = createDb(c.env.DB);
  const now = nowSeconds();

  // Retention without a cron trigger: prune on the one screen that reads the
  // table, off the response path.
  c.executionCtx.waitUntil(
    db
      .delete(errorEvents)
      .where(lt(errorEvents.createdAt, now - ADMIN_ERROR_RETENTION_DAYS * SECONDS_PER_DAY))
      .then(() => undefined)
      .catch(() => undefined),
  );

  const filters = [
    query.route ? eq(errorEvents.route, query.route) : undefined,
    query.status ? eq(errorEvents.status, query.status) : undefined,
  ];

  const rows = await db
    .select()
    .from(errorEvents)
    .where(filters.some(Boolean) ? and(...filters) : undefined)
    .orderBy(desc(errorEvents.createdAt), desc(errorEvents.id))
    .limit(query.limit + 1)
    .offset(query.offset);

  const page = rows.slice(0, query.limit);

  return c.json(
    adminErrorsResponseSchema.parse({
      errors: page,
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    }),
  );
});

admin.get("/rooms", async (c) => {
  const query = parseQuery(roomsQuerySchema, c.req.query());

  if (!query) {
    return apiError(c, 400, "bad_request", "Invalid list parameters.");
  }

  const db = createDb(c.env.DB);
  const search = query.query ? containsPattern(query.query) : null;

  const filters = [
    query.status ? eq(rooms.status, query.status) : undefined,
    search ? or(like(rooms.title, search), like(rooms.areaLabel, search)) : undefined,
  ];

  const rows = await db
    .select({ room: rooms, profile: profiles, user: users })
    .from(rooms)
    .innerJoin(profiles, eq(rooms.listerId, profiles.userId))
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(filters.some(Boolean) ? and(...filters) : undefined)
    .orderBy(desc(rooms.createdAt), desc(rooms.id))
    .limit(query.limit + 1)
    .offset(query.offset);

  const page = rows.slice(0, query.limit);

  return c.json(
    adminRoomsResponseSchema.parse({
      rooms: page.map((row) => ({
        id: row.room.id,
        title: row.room.title,
        areaLabel: row.room.areaLabel,
        rentEur: row.room.rentEur,
        status: row.room.status,
        photoCount: row.room.photoCount,
        createdAt: toUnixSeconds(row.room.createdAt),
        lister: {
          userId: row.user.id,
          displayName: row.profile.displayName,
          email: row.user.email,
        },
      })),
      nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
    }),
  );
});

admin.post("/rooms/:id/delete", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const room = await db.select().from(rooms).where(eq(rooms.id, id)).get();

  if (!room) {
    return apiError(c, 404, "not_found", "The listing does not exist.");
  }

  await c.env.PHOTOS.delete(
    Array.from({ length: ROOM_PHOTO_MAX_COUNT }, (_, index) => `rooms/${id}/${index}.jpg`),
  );
  await db.delete(rooms).where(eq(rooms.id, id));
  await writeAudit(db, adminId(c), "admin.room.delete", {
    targetRoomId: room.id,
    listerId: room.listerId,
  });

  return c.json(adminDeleteRoomResponseSchema.parse({ deleted: true }));
});

export const adminRoutes = admin;
