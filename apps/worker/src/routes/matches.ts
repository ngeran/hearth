import {
  deriveHabitTags,
  isOnboardingComplete,
  MATCHES_LIMIT,
  type MatchItem,
  matchEligibility,
  matchesResponseSchema,
  scoreCompatibility,
} from "@hearth/shared";
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { Hono } from "hono";

import { createDb } from "../db/client";
import { profiles, rooms, users } from "../db/schema";
import { toProfileSnapshot } from "../lib/profiles";
import { apiError } from "../lib/responses";
import { requireSession } from "../middleware/session";
import type { AppEnv } from "../types";

const matches = new Hono<AppEnv>();

matches.use("*", requireSession);

matches.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const id = c.get("user").id;

  const meRow = await db.select().from(profiles).where(eq(profiles.userId, id)).get();
  const meSnapshot = meRow ? toProfileSnapshot(meRow) : null;

  // The lifestyle guard is logically implied by completeness (a missing
  // questionnaire leaves onboarding incomplete) but keeps scoring below
  // non-nullable without an assertion.
  if (!meSnapshot || !isOnboardingComplete(meSnapshot) || !meSnapshot.lifestyle) {
    return apiError(c, 403, "forbidden", "Finish your profile to see matches.");
  }

  // Coarse SQL prefilter (spec gate 1); the data gates and scoring run in
  // pure shared code over the mapped snapshots.
  const rows = await db
    .select({ profile: profiles, user: users })
    .from(profiles)
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(
      and(
        ne(profiles.userId, id),
        isNotNull(profiles.lifestyleJson),
        isNotNull(profiles.onboardingCompletedAt),
        eq(users.status, "active"),
        isNull(users.deletedAt),
      ),
    );

  // hasRoom is attached after slicing (one indexed rooms lookup), so the
  // intermediate items are the MatchItem shape minus that field.
  const items: Omit<MatchItem, "hasRoom">[] = [];

  for (const { profile } of rows) {
    const snapshot = toProfileSnapshot(profile);
    const lifestyle = snapshot.lifestyle;

    // Defensive re-verification: the SQL flag predates any later profile
    // edit, so completeness is checked again on the live snapshot.
    if (!lifestyle || !isOnboardingComplete(snapshot)) {
      continue;
    }

    if (!matchEligibility(meSnapshot, snapshot)) {
      continue;
    }

    const compatibility = scoreCompatibility(meSnapshot.lifestyle.answers, lifestyle.answers);

    items.push({
      userId: profile.userId,
      displayName: snapshot.displayName ?? "",
      areaLabel: snapshot.areaLabel,
      lifeStage: snapshot.lifeStage,
      seeking: snapshot.seeking,
      budgetMin: snapshot.budgetMin,
      budgetMax: snapshot.budgetMax,
      moveInFrom: snapshot.moveInFrom,
      moveInTo: snapshot.moveInTo,
      campusId: snapshot.campusId,
      score: compatibility.score,
      tier: compatibility.tier,
      dimensionScores: compatibility.dimensionScores,
      sharedQuestions: [...compatibility.sharedQuestions],
      frictionQuestions: [...compatibility.frictionQuestions],
      habitTags: deriveHabitTags(lifestyle.answers),
      lifestyleAnswers: lifestyle.answers,
    });
  }

  // Score desc, then displayName asc (plain byte order, not locale-aware,
  // so ordering is identical everywhere matches are computed).
  items.sort(
    (a, b) =>
      b.score - a.score ||
      (a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0),
  );

  const visible = items.slice(0, MATCHES_LIMIT);

  // M5 "has a room" filter: one indexed lookup instead of a per-row join.
  const activeListers = visible.length
    ? await db
        .select({ listerId: rooms.listerId })
        .from(rooms)
        .where(
          and(
            eq(rooms.status, "active"),
            inArray(
              rooms.listerId,
              visible.map((i) => i.userId),
            ),
          ),
        )
    : [];
  const listerIds = new Set(activeListers.map((row) => row.listerId));

  return c.json(
    matchesResponseSchema.parse({
      matches: visible.map((item) => ({ ...item, hasRoom: listerIds.has(item.userId) })),
    }),
  );
});

export const matchesRoutes = matches;
