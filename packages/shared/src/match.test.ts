import { describe, expect, it } from "vitest";
import { LIFESTYLE_DIMENSIONS, LIFESTYLE_QUESTION_IDS, type LifestyleAnswers } from "./lifestyle";
import {
  deriveHabitTags,
  HABIT_TAG_IDS,
  type MatchCandidate,
  matchEligibility,
  matchesResponseSchema,
  matchItemSchema,
  scoreCompatibility,
} from "./match";

function answers(overrides: Partial<LifestyleAnswers> = {}): LifestyleAnswers {
  return {
    "social-gatherings": 1,
    "social-weeknights": 1,
    "clean-tidy": 1,
    "clean-shared": 1,
    "kitchen-cooking": 1,
    "kitchen-sharing": 1,
    "quiet-schedule": 1,
    "quiet-noise": 1,
    "guests-overnight": 1,
    "guests-partner": 1,
    ...overrides,
  };
}

/**
 * Answers at `distance` from the all-1 baseline for the first `count`
 * questions (in question order): distance 1 flips to 0, distance 2 to 2.
 */
function answersAtDistance(distance: 0 | 1 | 2, count: number): LifestyleAnswers {
  const overrides: Partial<LifestyleAnswers> = {};
  const level = distance === 2 ? 2 : 0;
  for (const id of LIFESTYLE_QUESTION_IDS.slice(0, count)) {
    overrides[id] = level;
  }
  return answers(overrides);
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    seeking: "roommate",
    budgetMin: 300,
    budgetMax: 500,
    moveInFrom: "2027-01-01",
    moveInTo: "2027-04-01",
    areaLat: 37.97,
    areaLng: 23.73,
    campusId: null,
    ...overrides,
  };
}

/**
 * An eligible pair by default (room meets roommate, ranges touch), so each
 * gate test perturbs exactly one side and asserts the single gate's verdict.
 */
function eligiblePair(
  meOverrides: Partial<MatchCandidate> = {},
  themOverrides: Partial<MatchCandidate> = {},
): boolean {
  return matchEligibility(
    candidate({ seeking: "room", ...meOverrides }),
    candidate({ seeking: "roommate", ...themOverrides }),
  );
}

const dimensionScoresFixture = {
  "social-rhythm": 100,
  cleanliness: 100,
  "kitchen-sharing": 100,
  "quiet-hours": 50,
  "guests-partners": 75,
};

function matchItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: "user_2",
    displayName: "Maria",
    areaLabel: "Koukaki, Athens",
    lifeStage: "student",
    seeking: "roommate",
    budgetMin: 300,
    budgetMax: 500,
    moveInFrom: "2027-01-01",
    moveInTo: "2027-04-01",
    campusId: null,
    score: 85,
    tier: "strong-overlap",
    dimensionScores: dimensionScoresFixture,
    sharedQuestions: ["social-gatherings"],
    frictionQuestions: ["quiet-schedule"],
    habitTags: ["very-tidy"],
    lifestyleAnswers: answers(),
    ...overrides,
  };
}

describe("scoreCompatibility", () => {
  it("scores identical answers 100 and strong overlap", () => {
    const result = scoreCompatibility(answers(), answers());
    expect(result.score).toBe(100);
    expect(result.tier).toBe("strong-overlap");
    expect(result.sharedQuestions).toEqual([...LIFESTYLE_QUESTION_IDS]);
    expect(result.frictionQuestions).toEqual([]);
    for (const dimension of LIFESTYLE_DIMENSIONS) {
      expect(result.dimensionScores[dimension]).toBe(100);
    }
  });

  it("scores opposite answers 0 and likely friction", () => {
    const low = answersAtDistance(0, 10);
    const high = answersAtDistance(2, 10);
    const result = scoreCompatibility(low, high);
    expect(result.score).toBe(0);
    expect(result.tier).toBe("likely-friction");
    expect(result.sharedQuestions).toEqual([]);
    expect(result.frictionQuestions).toEqual([...LIFESTYLE_QUESTION_IDS]);
    for (const dimension of LIFESTYLE_DIMENSIONS) {
      expect(result.dimensionScores[dimension]).toBe(0);
    }
  });

  it("weights same=1.0, adjacent=0.5, opposite=0 per question", () => {
    // One opposite (quiet-schedule 0 vs 2) and one adjacent: (8 + 0 + 0.5) / 10 = 0.85.
    const a = answers({ "quiet-schedule": 0 });
    const b = answers({ "quiet-schedule": 2, "social-weeknights": 0 });
    const result = scoreCompatibility(a, b);
    expect(result.score).toBe(85);
    expect(result.sharedQuestions).not.toContain("social-weeknights");
    expect(result.frictionQuestions).toEqual(["quiet-schedule"]);
  });

  it("lands 75/70 on either side of the strong threshold", () => {
    // 5 identical + 5 adjacent = 7.5 → 75 (strong); 4 + 6 = 7.0 → 70 (chat).
    expect(scoreCompatibility(answers(), answersAtDistance(1, 5)).score).toBe(75);
    expect(scoreCompatibility(answers(), answersAtDistance(1, 5)).tier).toBe("strong-overlap");
    expect(scoreCompatibility(answers(), answersAtDistance(1, 6)).score).toBe(70);
    expect(scoreCompatibility(answers(), answersAtDistance(1, 6)).tier).toBe("worth-a-chat");
  });

  it("lands 50/45 on either side of the chat threshold", () => {
    // 10 adjacent = 5.0 → 50 (chat); 9 adjacent + 1 opposite = 4.5 → 45.
    expect(scoreCompatibility(answers(), answersAtDistance(1, 10)).score).toBe(50);
    expect(scoreCompatibility(answers(), answersAtDistance(1, 10)).tier).toBe("worth-a-chat");
    // 9 adjacent + 1 opposite = 4.5 → 45: a has q0–q8 low, q9 mid;
    // b opposes q0 and stays adjacent everywhere else.
    const a = answersAtDistance(1, 9);
    const b = answers({ "social-gatherings": 2, "guests-partner": 0 });
    expect(scoreCompatibility(a, b).score).toBe(45);
    expect(scoreCompatibility(a, b).tier).toBe("likely-friction");
  });

  it("always produces multiples of 5 (weights are halves of ten)", () => {
    for (let count = 0; count <= 10; count++) {
      expect(scoreCompatibility(answers(), answersAtDistance(1, count)).score % 5).toBe(0);
      expect(scoreCompatibility(answers(), answersAtDistance(2, count)).score % 5).toBe(0);
    }
  });

  it("is symmetric in score, tier and dimension scores", () => {
    const a = answers({ "social-gatherings": 0, "quiet-schedule": 2, "clean-tidy": 2 });
    const b = answers({ "social-gatherings": 2, "quiet-schedule": 0, "clean-shared": 0 });
    const forward = scoreCompatibility(a, b);
    const backward = scoreCompatibility(b, a);
    expect(forward.score).toBe(backward.score);
    expect(forward.tier).toBe(backward.tier);
    expect(forward.dimensionScores).toEqual(backward.dimensionScores);
    expect([...forward.sharedQuestions].sort()).toEqual([...backward.sharedQuestions].sort());
    expect([...forward.frictionQuestions].sort()).toEqual([...backward.frictionQuestions].sort());
  });

  it("computes dimension scores from that dimension's questions only", () => {
    // Cleanliness fully opposite, everything else identical.
    const b = answers({ "clean-tidy": 0, "clean-shared": 2 });
    const a = answers({ "clean-tidy": 2, "clean-shared": 0 });
    const result = scoreCompatibility(a, b);
    expect(result.dimensionScores.cleanliness).toBe(0);
    expect(result.dimensionScores["social-rhythm"]).toBe(100);
    expect(result.score).toBe(80);
    expect(result.frictionQuestions).toEqual(["clean-tidy", "clean-shared"]);
  });

  it("lists shared and friction questions in question order", () => {
    const a = answers({ "quiet-noise": 0, "guests-partner": 0, "kitchen-cooking": 0 });
    const b = answers({ "quiet-noise": 2, "guests-partner": 2, "kitchen-cooking": 0 });
    const result = scoreCompatibility(a, b);
    expect(result.frictionQuestions).toEqual(["quiet-noise", "guests-partner"]);
    expect(result.sharedQuestions).toEqual(
      LIFESTYLE_QUESTION_IDS.filter((id) => id !== "quiet-noise" && id !== "guests-partner"),
    );
  });
});

describe("matchEligibility gates", () => {
  describe("seeking", () => {
    it("excludes two identical one-sided needs", () => {
      expect(matchEligibility(candidate({ seeking: "room" }), candidate({ seeking: "room" }))).toBe(
        false,
      );
      expect(
        matchEligibility(candidate({ seeking: "roommate" }), candidate({ seeking: "roommate" })),
      ).toBe(false);
    });

    it("accepts complementary or flexible pairs", () => {
      expect(
        matchEligibility(candidate({ seeking: "room" }), candidate({ seeking: "roommate" })),
      ).toBe(true);
      expect(
        matchEligibility(candidate({ seeking: "either" }), candidate({ seeking: "either" })),
      ).toBe(true);
      expect(
        matchEligibility(candidate({ seeking: "either" }), candidate({ seeking: "roommate" })),
      ).toBe(true);
    });

    it("passes when either side is unanswered", () => {
      expect(matchEligibility(candidate({ seeking: null }), candidate({ seeking: "room" }))).toBe(
        true,
      );
      expect(matchEligibility(candidate({ seeking: "room" }), candidate({ seeking: null }))).toBe(
        true,
      );
    });
  });

  describe("budget", () => {
    it("accepts overlapping and edge-touching ranges", () => {
      expect(eligiblePair()).toBe(true);
      expect(
        eligiblePair({ budgetMin: 300, budgetMax: 400 }, { budgetMin: 400, budgetMax: 600 }),
      ).toBe(true);
    });

    it("rejects disjoint ranges", () => {
      expect(
        eligiblePair({ budgetMin: 200, budgetMax: 300 }, { budgetMin: 400, budgetMax: 600 }),
      ).toBe(false);
    });

    it("passes when any side is unanswered", () => {
      expect(eligiblePair({ budgetMin: null })).toBe(true);
      expect(eligiblePair({ budgetMax: null })).toBe(true);
      expect(eligiblePair({}, { budgetMin: null })).toBe(true);
      expect(eligiblePair({}, { budgetMax: null })).toBe(true);
    });
  });

  describe("move-in window", () => {
    it("accepts overlapping and edge-touching windows", () => {
      expect(
        eligiblePair(
          { moveInFrom: "2027-01-01", moveInTo: "2027-03-01" },
          { moveInFrom: "2027-02-01", moveInTo: "2027-06-01" },
        ),
      ).toBe(true);
      expect(
        eligiblePair(
          { moveInFrom: "2027-01-01", moveInTo: "2027-02-01" },
          { moveInFrom: "2027-02-01", moveInTo: "2027-06-01" },
        ),
      ).toBe(true);
    });

    it("rejects disjoint windows, including across year boundaries", () => {
      expect(
        eligiblePair(
          { moveInFrom: "2027-01-01", moveInTo: "2027-02-01" },
          { moveInFrom: "2027-02-02", moveInTo: "2027-06-01" },
        ),
      ).toBe(false);
      expect(
        eligiblePair(
          { moveInFrom: "2026-11-01", moveInTo: "2026-12-31" },
          { moveInFrom: "2027-01-01", moveInTo: "2027-06-01" },
        ),
      ).toBe(false);
    });

    it("passes when any side is unanswered", () => {
      expect(eligiblePair({ moveInFrom: null })).toBe(true);
      expect(eligiblePair({}, { moveInTo: null })).toBe(true);
    });
  });

  describe("area", () => {
    it("accepts coordinates within ±0.05, inclusive at the boundary", () => {
      expect(
        eligiblePair({ areaLat: 37.97, areaLng: 23.73 }, { areaLat: 37.92, areaLng: 23.68 }),
      ).toBe(true);
    });

    it("rejects when either axis is beyond ±0.05", () => {
      expect(eligiblePair({ areaLat: 37.97 }, { areaLat: 37.91 })).toBe(false);
      expect(eligiblePair({ areaLng: 23.73 }, { areaLng: 23.67 })).toBe(false);
    });

    it("accepts a shared campus regardless of coordinates", () => {
      expect(
        eligiblePair(
          { campusId: "ntua-zografou", areaLat: 37.97, areaLng: 23.73 },
          { campusId: "ntua-zografou", areaLat: 40.64, areaLng: 22.94 },
        ),
      ).toBe(true);
    });

    it("rejects different campuses only when coordinates are also far", () => {
      expect(
        eligiblePair({ campusId: "ntua-zografou" }, { campusId: "uoc-rethymno", areaLat: 37.97 }),
      ).toBe(true);
      expect(
        eligiblePair(
          { campusId: "ntua-zografou" },
          { campusId: "uoc-rethymno", areaLat: 35.33, areaLng: 24.15 },
        ),
      ).toBe(false);
    });

    it("passes when coordinates are unanswered and no campus is shared", () => {
      expect(eligiblePair({ areaLat: null })).toBe(true);
      expect(eligiblePair({}, { areaLng: null })).toBe(true);
    });
  });
});

describe("deriveHabitTags", () => {
  it("returns no tags for all-middle answers", () => {
    expect(deriveHabitTags(answers())).toEqual([]);
  });

  it("derives each single rule", () => {
    expect(deriveHabitTags(answers({ "quiet-schedule": 0 }))).toEqual(["early-bird"]);
    expect(deriveHabitTags(answers({ "quiet-schedule": 2 }))).toEqual(["night-owl"]);
    expect(deriveHabitTags(answers({ "clean-tidy": 0 }))).toEqual(["very-tidy"]);
    expect(deriveHabitTags(answers({ "clean-tidy": 2 }))).toEqual(["relaxed-tidy"]);
    expect(deriveHabitTags(answers({ "kitchen-cooking": 0 }))).toEqual(["home-cook"]);
    expect(deriveHabitTags(answers({ "social-gatherings": 2 }))).toEqual(["social-host"]);
  });

  it("keeps mutually exclusive tags apart", () => {
    // quiet-schedule is one answer; both schedule tags can never co-occur,
    // and neither can both tidiness tags.
    for (const level of [0, 1, 2] as const) {
      const tags = deriveHabitTags(answers({ "quiet-schedule": level, "clean-tidy": level }));
      expect(tags).toHaveLength(level === 1 ? 0 : 2);
    }
  });

  it("caps at three tags in question order", () => {
    const tags = deriveHabitTags(
      answers({
        "social-gatherings": 2,
        "clean-tidy": 0,
        "kitchen-cooking": 0,
        "quiet-schedule": 0,
      }),
    );
    expect(tags).toEqual(["social-host", "very-tidy", "home-cook"]);
  });

  it("only ever returns known tag ids without duplicates", () => {
    const tags = deriveHabitTags(
      answers({
        "social-gatherings": 2,
        "clean-tidy": 2,
        "kitchen-cooking": 0,
        "quiet-schedule": 2,
      }),
    );
    expect(tags.every((tag) => (HABIT_TAG_IDS as readonly string[]).includes(tag))).toBe(true);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("matchesResponseSchema", () => {
  it("accepts a valid payload", () => {
    const payload = { matches: [matchItem()] };
    expect(matchesResponseSchema.safeParse(payload).success).toBe(true);
  });

  it("accepts an empty list", () => {
    expect(matchesResponseSchema.safeParse({ matches: [] }).success).toBe(true);
  });

  it("rejects extra keys, unknown tiers, tags and out-of-range scores", () => {
    expect(matchItemSchema.safeParse(matchItem({ teaser: "hi" })).success).toBe(false);
    expect(matchItemSchema.safeParse(matchItem({ tier: "perfect" })).success).toBe(false);
    expect(matchItemSchema.safeParse(matchItem({ score: 101 })).success).toBe(false);
    expect(matchItemSchema.safeParse(matchItem({ habitTags: ["mysterious"] })).success).toBe(false);
    expect(matchItemSchema.safeParse(matchItem({ sharedQuestions: ["smoking"] })).success).toBe(
      false,
    );
  });

  it("rejects an incomplete lifestyle answers object", () => {
    const incomplete: Record<string, unknown> = { ...answers() };
    delete incomplete["guests-partner"];
    expect(matchItemSchema.safeParse(matchItem({ lifestyleAnswers: incomplete })).success).toBe(
      false,
    );
  });

  it("rejects an unknown dimension score key", () => {
    expect(
      matchItemSchema.safeParse(
        matchItem({ dimensionScores: { ...dimensionScoresFixture, romance: 50 } }),
      ).success,
    ).toBe(false);
  });

  it("rejects extra keys on the response envelope", () => {
    expect(matchesResponseSchema.safeParse({ matches: [], total: 0 }).success).toBe(false);
  });
});
