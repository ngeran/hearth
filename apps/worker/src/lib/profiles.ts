import {
  coarsenCoordinate,
  getMissingOnboardingFields,
  isOnboardingComplete,
  type MeResponse,
  meResponseSchema,
  type ProfileLanguage,
  type ProfilePatch,
  type ProfileSnapshot,
  parseStoredLifestyle,
  userResponseSchema,
} from "@hearth/shared";
import { eq } from "drizzle-orm";

import type { Db } from "../db/client";
import { campuses, profiles, users } from "../db/schema";
import {
  asLanguage,
  asLifeStage,
  asSeeking,
  hasPatch,
  preferredLanguageFromHeader,
} from "./academic-code";
import { nowDate, toUnixSeconds } from "./time";

export type ProfileRow = typeof profiles.$inferSelect;
export type UserRow = typeof users.$inferSelect;

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

function photoUrlFor(updatedAt: Date): string {
  return `/api/v1/me/photo?v=${toUnixSeconds(updatedAt)}`;
}

export function toProfileSnapshot(row: ProfileRow): ProfileSnapshot {
  return {
    displayName: row.displayName,
    photoUrl: row.photoKey ? photoUrlFor(row.updatedAt) : null,
    areaLabel: row.areaLabel,
    areaLat: row.areaLat,
    areaLng: row.areaLng,
    moveInFrom: row.moveInFrom,
    moveInTo: row.moveInTo,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    seeking: asSeeking(row.seeking),
    lifeStage: asLifeStage(row.lifeStage),
    campusId: row.campusId,
    language: asLanguage(row.language),
    bio: row.bio,
    lifestyle: parseStoredLifestyle(row.lifestyleJson),
    ageConfirmed: row.ageConfirmed,
    academicEmail: row.academicEmail,
    academicEmailVerifiedAt: row.academicEmailVerifiedAt
      ? toUnixSeconds(row.academicEmailVerifiedAt)
      : null,
    onboardingCompletedAt: row.onboardingCompletedAt
      ? toUnixSeconds(row.onboardingCompletedAt)
      : null,
    updatedAt: toUnixSeconds(row.updatedAt),
  };
}

export function toUserResponse(row: UserRow) {
  return userResponseSchema.parse({
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    name: row.name,
    image: row.image ?? null,
    createdAt: toUnixSeconds(row.createdAt),
    updatedAt: toUnixSeconds(row.updatedAt),
  });
}

export async function ensureProfile(
  db: Db,
  userId: string,
  language: ProfileLanguage,
): Promise<ProfileRow> {
  const existing = await db.select().from(profiles).where(eq(profiles.userId, userId)).get();

  if (existing) {
    return existing;
  }

  const now = nowDate();
  await db
    .insert(profiles)
    .values({
      userId,
      language,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const created = await db.select().from(profiles).where(eq(profiles.userId, userId)).get();

  if (!created) {
    throw new Error("Could not create the profile row.");
  }

  return created;
}

export async function getMeResponse(
  db: Db,
  userId: string,
  acceptLanguage: string | undefined,
  isAdmin: boolean,
): Promise<MeResponse> {
  const user = await db.select().from(users).where(eq(users.id, userId)).get();

  if (!user) {
    throw new Error("The signed-in user no longer exists.");
  }

  const profile = await ensureProfile(db, userId, preferredLanguageFromHeader(acceptLanguage));
  const snapshot = toProfileSnapshot(profile);
  const missingFields = getMissingOnboardingFields(snapshot);

  return meResponseSchema.parse({
    user: toUserResponse(user),
    profile: snapshot,
    complete: missingFields.length === 0,
    missingFields,
    isAdmin,
  });
}

export async function applyProfilePatch(
  db: Db,
  userId: string,
  patch: ProfilePatch,
  acceptLanguage: string | undefined,
  isAdmin: boolean,
): Promise<MeResponse> {
  const current = await ensureProfile(db, userId, preferredLanguageFromHeader(acceptLanguage));

  if (patch.ageConfirmed === false) {
    throw new ProfileValidationError("You must confirm that you are 18 or older.");
  }

  const displayName = hasPatch(patch, "displayName")
    ? (patch.displayName ?? null)
    : current.displayName;
  const areaLabel = hasPatch(patch, "areaLabel") ? (patch.areaLabel ?? null) : current.areaLabel;
  const rawAreaLat = hasPatch(patch, "areaLat") ? (patch.areaLat ?? null) : current.areaLat;
  const rawAreaLng = hasPatch(patch, "areaLng") ? (patch.areaLng ?? null) : current.areaLng;
  const areaLat = rawAreaLat === null ? null : coarsenCoordinate(rawAreaLat);
  const areaLng = rawAreaLng === null ? null : coarsenCoordinate(rawAreaLng);
  const moveInFrom = hasPatch(patch, "moveInFrom")
    ? (patch.moveInFrom ?? null)
    : current.moveInFrom;
  const moveInTo = hasPatch(patch, "moveInTo") ? (patch.moveInTo ?? null) : current.moveInTo;
  const budgetMin = hasPatch(patch, "budgetMin") ? (patch.budgetMin ?? null) : current.budgetMin;
  const budgetMax = hasPatch(patch, "budgetMax") ? (patch.budgetMax ?? null) : current.budgetMax;
  const seeking = hasPatch(patch, "seeking") ? (patch.seeking ?? null) : current.seeking;
  const lifeStage = hasPatch(patch, "lifeStage") ? (patch.lifeStage ?? null) : current.lifeStage;
  const campusId = hasPatch(patch, "campusId") ? (patch.campusId ?? null) : current.campusId;
  const language = hasPatch(patch, "language")
    ? (patch.language ?? current.language)
    : current.language;
  const bio = hasPatch(patch, "bio") ? (patch.bio ?? null) : current.bio;
  // Store the exact validated envelope; preserve the raw column on unrelated
  // patches so an unknown future version never gets silently destroyed.
  const lifestyleJson = hasPatch(patch, "lifestyle")
    ? JSON.stringify(patch.lifestyle)
    : current.lifestyleJson;
  const lifestyle = parseStoredLifestyle(lifestyleJson);
  const ageConfirmed = hasPatch(patch, "ageConfirmed")
    ? (patch.ageConfirmed ?? current.ageConfirmed)
    : current.ageConfirmed;

  if (campusId) {
    const campus = await db
      .select({ id: campuses.id })
      .from(campuses)
      .where(eq(campuses.id, campusId))
      .get();

    if (!campus) {
      throw new ProfileValidationError("Choose a campus from the list.");
    }
  }

  if ((areaLat === null) !== (areaLng === null)) {
    throw new ProfileValidationError("Provide both latitude and longitude, or neither.");
  }

  if (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax) {
    throw new ProfileValidationError("The minimum budget cannot be higher than the maximum.");
  }

  if (moveInFrom && moveInTo && moveInFrom > moveInTo) {
    throw new ProfileValidationError("The move-in start must be before the end date.");
  }

  const now = nowDate();
  const preview: ProfileSnapshot = {
    ...toProfileSnapshot(current),
    displayName,
    areaLabel,
    areaLat,
    areaLng,
    moveInFrom,
    moveInTo,
    budgetMin,
    budgetMax,
    seeking: asSeeking(seeking),
    lifeStage: asLifeStage(lifeStage),
    campusId,
    language: asLanguage(language),
    bio,
    lifestyle,
    ageConfirmed,
    updatedAt: toUnixSeconds(now),
  };
  const complete = isOnboardingComplete(preview);
  const onboardingCompletedAt = complete
    ? (current.onboardingCompletedAt ?? now)
    : current.onboardingCompletedAt;

  await db
    .update(profiles)
    .set({
      displayName,
      areaLabel,
      areaLat,
      areaLng,
      moveInFrom,
      moveInTo,
      budgetMin,
      budgetMax,
      seeking,
      lifeStage,
      campusId,
      language,
      bio,
      lifestyleJson,
      ageConfirmed,
      onboardingCompletedAt,
      updatedAt: now,
    })
    .where(eq(profiles.userId, userId));

  if (hasPatch(patch, "displayName")) {
    await db
      .update(users)
      .set({ name: displayName ?? "", updatedAt: now })
      .where(eq(users.id, userId));
  }

  return getMeResponse(db, userId, acceptLanguage, isAdmin);
}
