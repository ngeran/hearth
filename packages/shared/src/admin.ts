import { z } from "zod";

import { ONBOARDING_FIELDS } from "./profile";

/**
 * Admin console contracts (docs/specs/M7.md). These schemas are the only
 * shapes the Worker may return to `/api/v1/admin/*`; the console parses them
 * before rendering, exactly like the user-facing endpoints.
 */

export const ADMIN_LIST_DEFAULT_LIMIT = 25;
export const ADMIN_LIST_MAX_LIMIT = 50;
export const ADMIN_ERROR_RETENTION_DAYS = 30;
export const ADMIN_ERROR_MESSAGE_MAX_LENGTH = 200;

/** Presence is coarse on purpose: a 15-minute window and a 5-minute write throttle. */
export const ADMIN_ONLINE_WINDOW_SECONDS = 15 * 60;
export const ADMIN_PRESENCE_TOUCH_SECONDS = 5 * 60;

/** An impression older than this with no thread counts as an unsuccessful match. */
export const ADMIN_MATCH_WINDOW_DAYS = 7;

const unixSeconds = z.number().int().nonnegative();

export const adminOverviewSchema = z
  .object({
    generatedAt: unixSeconds,
    users: z
      .object({
        total: z.number().int().nonnegative(),
        registeredToday: z.number().int().nonnegative(),
        registered7d: z.number().int().nonnegative(),
        registered30d: z.number().int().nonnegative(),
        online: z.number().int().nonnegative(),
        completeProfiles: z.number().int().nonnegative(),
        academicVerified: z.number().int().nonnegative(),
      })
      .strict(),
    rooms: z
      .object({
        active: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .strict(),
    matches: z
      .object({
        impressions7d: z.number().int().nonnegative(),
        successfulPairs: z.number().int().nonnegative(),
        unsuccessfulPairs: z.number().int().nonnegative(),
      })
      .strict(),
    chat: z
      .object({
        threads: z.number().int().nonnegative(),
        active7d: z.number().int().nonnegative(),
      })
      .strict(),
    push: z
      .object({
        subscriptions: z.number().int().nonnegative(),
      })
      .strict(),
    errors: z
      .object({
        last24h: z.number().int().nonnegative(),
        last7d: z.number().int().nonnegative(),
        lastAt: unixSeconds.nullable(),
      })
      .strict(),
  })
  .strict();

export const adminUserListItemSchema = z
  .object({
    id: z.string().min(1),
    email: z.string().min(3),
    name: z.string(),
    displayName: z.string().nullable(),
    status: z.string().min(1),
    createdAt: unixSeconds,
    lastSeenAt: unixSeconds,
    onboardingComplete: z.boolean(),
    academicVerified: z.boolean(),
    deleted: z.boolean(),
  })
  .strict();

export const adminUsersResponseSchema = z
  .object({
    users: z.array(adminUserListItemSchema),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict();

const adminProfileSummarySchema = z
  .object({
    displayName: z.string().nullable(),
    areaLabel: z.string().nullable(),
    seeking: z.string().nullable(),
    lifeStage: z.string().nullable(),
    budgetMin: z.number().int().nullable(),
    budgetMax: z.number().int().nullable(),
    moveInFrom: z.string().nullable(),
    moveInTo: z.string().nullable(),
    language: z.string().min(2),
    bio: z.string().nullable(),
    ageConfirmed: z.boolean(),
    onboardingCompletedAt: unixSeconds.nullable(),
    academicEmail: z.string().nullable(),
    academicVerifiedAt: unixSeconds.nullable(),
  })
  .strict();

export const adminUserDetailSchema = z
  .object({
    user: adminUserListItemSchema,
    profile: adminProfileSummarySchema.nullable(),
    /**
     * The exact reasons the profile is incomplete, from the same shared rule
     * the user-facing `/me` response uses, so support sees what the member sees.
     * A member without a profile row is missing every field.
     */
    missingProfileFields: z.array(z.enum(ONBOARDING_FIELDS)),
    counts: z
      .object({
        sessions: z.number().int().nonnegative(),
        threads: z.number().int().nonnegative(),
        rooms: z.number().int().nonnegative(),
        pushSubscriptions: z.number().int().nonnegative(),
      })
      .strict(),
    recentThreads: z.array(
      z
        .object({
          peerId: z.string().min(1),
          peerName: z.string().nullable(),
          updatedAt: unixSeconds,
        })
        .strict(),
    ),
    rooms: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string().min(1),
          status: z.string().min(1),
          rentEur: z.number().int(),
          createdAt: unixSeconds,
        })
        .strict(),
    ),
  })
  .strict();

/** Typing the target's email is the deliberate friction against a misclick. */
export const adminDeleteUserSchema = z
  .object({
    confirmEmail: z.string().trim().min(3).max(320),
  })
  .strict();

export const adminRevokeSessionsResponseSchema = z
  .object({
    revoked: z.number().int().nonnegative(),
  })
  .strict();

export const adminDeleteUserResponseSchema = z
  .object({
    deleted: z.literal(true),
  })
  .strict();

export const adminErrorEventSchema = z
  .object({
    id: z.string().min(1),
    createdAt: unixSeconds,
    requestId: z.string().nullable(),
    method: z.string().min(1),
    route: z.string().min(1),
    status: z.number().int(),
    errorName: z.string().min(1),
    message: z.string(),
  })
  .strict();

export const adminErrorsResponseSchema = z
  .object({
    errors: z.array(adminErrorEventSchema),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const adminRoomListItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    areaLabel: z.string().min(1),
    rentEur: z.number().int(),
    status: z.string().min(1),
    photoCount: z.number().int().nonnegative(),
    createdAt: unixSeconds,
    lister: z
      .object({
        userId: z.string().min(1),
        displayName: z.string().nullable(),
        email: z.string().min(3),
      })
      .strict(),
  })
  .strict();

export const adminRoomsResponseSchema = z
  .object({
    rooms: z.array(adminRoomListItemSchema),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const adminDeleteRoomResponseSchema = z
  .object({
    deleted: z.literal(true),
  })
  .strict();

export type AdminOverview = z.infer<typeof adminOverviewSchema>;
export type AdminUserListItem = z.infer<typeof adminUserListItemSchema>;
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export type AdminDeleteUser = z.infer<typeof adminDeleteUserSchema>;
export type AdminRevokeSessionsResponse = z.infer<typeof adminRevokeSessionsResponseSchema>;
export type AdminErrorEvent = z.infer<typeof adminErrorEventSchema>;
export type AdminErrorsResponse = z.infer<typeof adminErrorsResponseSchema>;
export type AdminRoomListItem = z.infer<typeof adminRoomListItemSchema>;
export type AdminRoomsResponse = z.infer<typeof adminRoomsResponseSchema>;
