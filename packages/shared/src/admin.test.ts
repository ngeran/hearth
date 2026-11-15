import { describe, expect, it } from "vitest";
import {
  ADMIN_LIST_DEFAULT_LIMIT,
  ADMIN_LIST_MAX_LIMIT,
  ADMIN_MATCH_WINDOW_DAYS,
  ADMIN_ONLINE_WINDOW_SECONDS,
  ADMIN_PRESENCE_TOUCH_SECONDS,
  adminDeleteUserResponseSchema,
  adminDeleteUserSchema,
  adminErrorEventSchema,
  adminErrorsResponseSchema,
  adminOverviewSchema,
  adminRevokeSessionsResponseSchema,
  adminRoomListItemSchema,
  adminRoomsResponseSchema,
  adminUserDetailSchema,
  adminUserListItemSchema,
  adminUsersResponseSchema,
} from "./admin";

const overview = {
  generatedAt: 1_763_000_000,
  users: {
    total: 12,
    registeredToday: 2,
    registered7d: 5,
    registered30d: 9,
    online: 3,
    completeProfiles: 8,
    academicVerified: 6,
  },
  rooms: { active: 4, total: 5 },
  matches: { impressions7d: 30, successfulPairs: 2, unsuccessfulPairs: 10 },
  chat: { threads: 2, active7d: 2 },
  push: { subscriptions: 7 },
  errors: { last24h: 1, last7d: 3, lastAt: 1_762_999_000 },
};

const userItem = {
  id: "user_1",
  email: "ada@example.com",
  name: "Ada",
  displayName: "Ada",
  status: "active",
  createdAt: 1_762_000_000,
  lastSeenAt: 1_762_999_000,
  onboardingComplete: true,
  academicVerified: false,
  deleted: false,
};

describe("adminOverviewSchema", () => {
  it("accepts a complete payload", () => {
    expect(adminOverviewSchema.parse(overview)).toEqual(overview);
  });

  it("rejects negative counters", () => {
    const invalid = { ...overview, users: { ...overview.users, online: -1 } };
    expect(adminOverviewSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(adminOverviewSchema.safeParse({ ...overview, extra: true }).success).toBe(false);
  });

  it("allows a missing newest error timestamp", () => {
    const noErrors = { ...overview, errors: { last24h: 0, last7d: 0, lastAt: null } };
    expect(adminOverviewSchema.safeParse(noErrors).success).toBe(true);
  });
});

describe("admin user schemas", () => {
  it("accepts a list item and a null next offset", () => {
    expect(adminUsersResponseSchema.parse({ users: [userItem], nextOffset: null })).toEqual({
      users: [userItem],
      nextOffset: null,
    });
  });

  it("rejects a fractional timestamp", () => {
    const invalid = { ...userItem, createdAt: 1.5 };
    expect(adminUserListItemSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts a detail payload without a profile row", () => {
    const detail = {
      user: userItem,
      profile: null,
      missingProfileFields: ["displayName", "photo"],
      counts: { sessions: 0, threads: 0, rooms: 0, pushSubscriptions: 0 },
      recentThreads: [],
      rooms: [],
    };
    expect(adminUserDetailSchema.safeParse(detail).success).toBe(true);
  });

  it("rejects an unknown missing-profile reason", () => {
    const detail = {
      user: userItem,
      profile: null,
      missingProfileFields: ["nickname"],
      counts: { sessions: 0, threads: 0, rooms: 0, pushSubscriptions: 0 },
      recentThreads: [],
      rooms: [],
    };
    expect(adminUserDetailSchema.safeParse(detail).success).toBe(false);
  });

  it("trims the deletion confirmation email and enforces its bounds", () => {
    expect(adminDeleteUserSchema.parse({ confirmEmail: "  ada@example.com  " })).toEqual({
      confirmEmail: "ada@example.com",
    });
    expect(adminDeleteUserSchema.safeParse({ confirmEmail: "ab" }).success).toBe(false);
    expect(adminDeleteUserSchema.safeParse({ confirmEmail: "a".repeat(321) }).success).toBe(false);
    expect(adminDeleteUserSchema.safeParse({ confirmEmail: "a@b.c", extra: 1 }).success).toBe(
      false,
    );
  });

  it("keeps action responses literal", () => {
    expect(adminRevokeSessionsResponseSchema.parse({ revoked: 2 })).toEqual({ revoked: 2 });
    expect(adminDeleteUserResponseSchema.safeParse({ deleted: false }).success).toBe(false);
  });
});

describe("admin error schemas", () => {
  const event = {
    id: "err_1",
    createdAt: 1_762_999_000,
    requestId: null,
    method: "GET",
    route: "/api/v1/matches",
    status: 500,
    errorName: "TypeError",
    message: "undefined is not a function",
  };

  it("accepts a scrubbed row", () => {
    expect(adminErrorEventSchema.parse(event)).toEqual(event);
  });

  it("rejects an unknown field", () => {
    expect(adminErrorEventSchema.safeParse({ ...event, stack: "..." }).success).toBe(false);
  });

  it("accepts an empty page", () => {
    expect(adminErrorsResponseSchema.parse({ errors: [], nextOffset: null })).toEqual({
      errors: [],
      nextOffset: null,
    });
  });
});

describe("admin room schemas", () => {
  const room = {
    id: "room_1",
    title: "Sunny room near campus",
    areaLabel: "Zografou",
    rentEur: 420,
    status: "active",
    photoCount: 2,
    createdAt: 1_762_500_000,
    lister: { userId: "user_1", displayName: "Ada", email: "ada@example.com" },
  };

  it("accepts a listing with lister contact", () => {
    expect(adminRoomListItemSchema.parse(room)).toEqual(room);
  });

  it("rejects a negative photo count", () => {
    expect(adminRoomListItemSchema.safeParse({ ...room, photoCount: -1 }).success).toBe(false);
  });

  it("accepts a page with a continuation offset", () => {
    expect(adminRoomsResponseSchema.parse({ rooms: [room], nextOffset: 26 })).toEqual({
      rooms: [room],
      nextOffset: 26,
    });
  });
});

describe("admin constants", () => {
  it("keeps pagination and presence windows ordered", () => {
    expect(ADMIN_LIST_DEFAULT_LIMIT).toBeLessThanOrEqual(ADMIN_LIST_MAX_LIMIT);
    expect(ADMIN_PRESENCE_TOUCH_SECONDS).toBeLessThan(ADMIN_ONLINE_WINDOW_SECONDS);
    expect(ADMIN_MATCH_WINDOW_DAYS).toBe(7);
  });
});
