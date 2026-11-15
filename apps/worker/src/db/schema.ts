import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp" });
const boolean = (name: string) => integer(name, { mode: "boolean" });

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("user"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    deletedAt: timestamp("deleted_at"),
    // M7 presence: unix seconds, 0 until the first throttled touch.
    lastSeenAt: integer("last_seen_at").notNull().default(0),
  },
  (table) => [index("idx_users_status").on(table.status)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("idx_session_user_id").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("idx_account_user_id").on(table.userId),
    uniqueIndex("unique_account_provider").on(table.providerId, table.accountId),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("idx_verification_identifier").on(table.identifier)],
);

export const passkey = sqliteTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at"),
    aaguid: text("aaguid"),
  },
  (table) => [
    index("idx_passkey_user_id").on(table.userId),
    uniqueIndex("unique_passkey_credential").on(table.credentialID),
  ],
);

export const rateLimit = sqliteTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    lastRequest: integer("last_request").notNull(),
  },
  (table) => [index("idx_rate_limit_last_request").on(table.lastRequest)],
);

export const campuses = sqliteTable("campuses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameEl: text("name_el").notNull(),
  city: text("city").notNull(),
  cityEl: text("city_el").notNull(),
  country: text("country").notNull().default("GR"),
  createdAt: timestamp("created_at").notNull(),
});

export const profiles = sqliteTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    photoKey: text("photo_key"),
    areaLabel: text("area_label"),
    areaLat: real("area_lat"),
    areaLng: real("area_lng"),
    moveInFrom: text("move_in_from"),
    moveInTo: text("move_in_to"),
    budgetMin: integer("budget_min"),
    budgetMax: integer("budget_max"),
    seeking: text("seeking"),
    lifeStage: text("life_stage"),
    campusId: text("campus_id").references(() => campuses.id, { onDelete: "set null" }),
    language: text("language").notNull().default("en"),
    bio: text("bio"),
    // Versioned lifestyle questionnaire envelope ({ version, answers }); parsed
    // and validated with the shared schema on every read, never raw.
    lifestyleJson: text("lifestyle_json"),
    ageConfirmed: boolean("age_confirmed").notNull().default(false),
    academicEmail: text("academic_email"),
    academicEmailVerifiedAt: timestamp("academic_email_verified_at"),
    onboardingCompletedAt: timestamp("onboarding_completed_at"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("idx_profiles_campus_id").on(table.campusId)],
);

export const academicVerifications = sqliteTable(
  "academic_verifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastSentAt: timestamp("last_sent_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("idx_academic_verifications_user_id").on(table.userId),
    index("idx_academic_verifications_user_consumed").on(table.userId, table.consumedAt),
    // At most one active (unconsumed) challenge per user; mirrors migration 0002.
    uniqueIndex("idx_academic_verifications_active")
      .on(table.userId)
      .where(sql`consumed_at IS NULL`),
  ],
);

// M4 chat thread metadata. Message bodies live only inside the ChatRoom
// Durable Object; this table exists for ordered thread discovery. The
// composite PK mirrors the deterministic chatThreadId used for idFromName.
export const chatThreads = sqliteTable(
  "chat_threads",
  {
    userLow: text("user_low")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userHigh: text("user_high")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userLow, table.userHigh] }),
    index("idx_chat_threads_high_updated").on(table.userHigh, table.updatedAt),
  ],
);

// M5 room listings. Photo bytes live in R2 (rooms/<id>/<n>.jpg); the
// counter here drives the browse card and the photo endpoints. Rows
// survive withdrawal (own history); browse filters status = 'active'.
// One-active-per-lister is enforced at the route layer on purpose.
export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    listerId: text("lister_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    areaLabel: text("area_label").notNull(),
    // Coords are optional like profile coords: the form collects a label,
    // coordinates only exist when the lister's profile carries them.
    areaLat: real("area_lat"),
    areaLng: real("area_lng"),
    rentEur: integer("rent_eur").notNull(),
    billsIncluded: boolean("bills_included").notNull().default(false),
    availableFrom: text("available_from").notNull(),
    photoCount: integer("photo_count").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("idx_rooms_status_created").on(table.status, table.createdAt),
    index("idx_rooms_lister").on(table.listerId),
  ],
);

// M6 web push subscriptions: one row per device. The push-service
// endpoint is the natural key (re-subscribe upserts); rows cascade with
// the account, and the me.ts purge block also deletes them explicitly
// to match house style.
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("idx_push_subscriptions_user").on(table.userId)],
);

// M7 admin console: scrubbed server errors (no headers, query strings, or user
// ids; the message is redacted and capped by the Worker before insertion).
export const errorEvents = sqliteTable(
  "error_events",
  {
    id: text("id").primaryKey(),
    createdAt: integer("created_at").notNull(),
    requestId: text("request_id"),
    method: text("method").notNull(),
    route: text("route").notNull(),
    status: integer("status").notNull(),
    errorName: text("error_name").notNull(),
    message: text("message").notNull(),
  },
  (table) => [
    index("idx_error_events_created").on(table.createdAt),
    index("idx_error_events_route_created").on(table.route, table.createdAt),
  ],
);

// M7 match metrics: one directed row per viewer/candidate pair, recording the
// first time the matches feed showed them. "Successful" pairs are the ones that
// later gained a chat_threads row; the pair is the primary key, so re-rendering
// the feed never duplicates an impression.
export const matchEvents = sqliteTable(
  "match_events",
  {
    viewerId: text("viewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.viewerId, table.candidateId] }),
    index("idx_match_events_created").on(table.createdAt),
    index("idx_match_events_candidate").on(table.candidateId),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id"),
    event: text("event").notNull(),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("idx_audit_log_event_created").on(table.event, table.createdAt)],
);
