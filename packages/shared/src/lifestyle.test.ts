import { describe, expect, it } from "vitest";

import {
  deriveLifestyleArchetype,
  LIFESTYLE_DIMENSIONS,
  LIFESTYLE_QUESTION_IDS,
  LIFESTYLE_QUESTIONS,
  type LifestyleAnswers,
  lifestyleEnvelopeSchema,
  parseStoredLifestyle,
} from "./lifestyle";

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

describe("lifestyle questionnaire structure", () => {
  it("keeps the question list and the schema keys in sync", () => {
    expect([...LIFESTYLE_QUESTION_IDS].sort()).toEqual(
      Object.keys(lifestyleEnvelopeSchema.shape.answers.shape).sort(),
    );
  });

  it("has two questions per dimension in contiguous order", () => {
    expect(LIFESTYLE_QUESTIONS).toHaveLength(10);
    expect(LIFESTYLE_QUESTIONS.map((question) => question.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);

    for (const dimension of LIFESTYLE_DIMENSIONS) {
      expect(
        LIFESTYLE_QUESTIONS.filter((question) => question.dimension === dimension),
      ).toHaveLength(2);
    }
  });
});

describe("lifestyleAnswersSchema", () => {
  it("accepts a complete answer set", () => {
    expect(lifestyleEnvelopeSchema.safeParse({ version: 1, answers: answers() }).success).toBe(
      true,
    );
  });

  it("round-trips through JSON", () => {
    const stored = JSON.stringify({ version: 1, answers: answers() });
    expect(lifestyleEnvelopeSchema.safeParse(JSON.parse(stored)).success).toBe(true);
  });

  it("rejects a missing question", () => {
    const partial: Record<string, unknown> = { ...answers() };
    delete partial["clean-tidy"];

    expect(lifestyleEnvelopeSchema.safeParse({ version: 1, answers: partial }).success).toBe(false);
  });

  it("rejects unknown questions, extra keys and wrong versions", () => {
    expect(
      lifestyleEnvelopeSchema.safeParse({ version: 1, answers: { ...answers(), smoking: 0 } })
        .success,
    ).toBe(false);
    expect(
      lifestyleEnvelopeSchema.safeParse({ version: 1, answers: answers(), mood: "calm" }).success,
    ).toBe(false);
    expect(lifestyleEnvelopeSchema.safeParse({ version: 2, answers: answers() }).success).toBe(
      false,
    );
    expect(lifestyleEnvelopeSchema.safeParse({ answers: answers() }).success).toBe(false);
  });

  it("rejects out-of-range and non-numeric levels", () => {
    const outOfRange: Record<string, unknown> = { ...answers(), "guests-overnight": 3 };
    const nonNumeric: Record<string, unknown> = { ...answers(), "guests-overnight": "1" };

    expect(lifestyleEnvelopeSchema.safeParse({ version: 1, answers: outOfRange }).success).toBe(
      false,
    );
    expect(lifestyleEnvelopeSchema.safeParse({ version: 1, answers: nonNumeric }).success).toBe(
      false,
    );
  });
});

describe("parseStoredLifestyle", () => {
  it("returns null for missing data and damaged rows", () => {
    expect(parseStoredLifestyle(null)).toBeNull();
    expect(parseStoredLifestyle("not json")).toBeNull();
    expect(parseStoredLifestyle('{"version":1,"answers":{}}')).toBeNull();
    expect(parseStoredLifestyle('{"version":99,"answers":{}}')).toBeNull();
  });

  it("returns the parsed envelope for a valid row", () => {
    const stored = JSON.stringify({ version: 1, answers: answers() });

    expect(parseStoredLifestyle(stored)).toEqual({ version: 1, answers: answers() });
  });
});

describe("deriveLifestyleArchetype", () => {
  it("maps balanced mid-social answers to steady rhythm", () => {
    expect(deriveLifestyleArchetype(answers())).toBe("steady-rhythm");
  });

  it("maps low social plus early schedule to quiet mornings", () => {
    expect(
      deriveLifestyleArchetype(
        answers({ "social-gatherings": 0, "social-weeknights": 0, "quiet-schedule": 0 }),
      ),
    ).toBe("quiet-mornings");
  });

  it("maps low social with a non-early schedule to calm sanctuary", () => {
    expect(
      deriveLifestyleArchetype(answers({ "social-gatherings": 0, "social-weeknights": 1 })),
    ).toBe("calm-sanctuary");
    expect(
      deriveLifestyleArchetype(
        answers({ "social-gatherings": 0, "social-weeknights": 0, "quiet-schedule": 1 }),
      ),
    ).toBe("calm-sanctuary");
  });

  it("maps a late schedule with low or mid social to night owl haven", () => {
    expect(deriveLifestyleArchetype(answers({ "social-gatherings": 0, "quiet-schedule": 2 }))).toBe(
      "night-owl-haven",
    );
    expect(
      deriveLifestyleArchetype(
        answers({ "social-gatherings": 1, "social-weeknights": 1, "quiet-schedule": 2 }),
      ),
    ).toBe("night-owl-haven");
  });

  it("lets a high social score outrank a late schedule", () => {
    expect(
      deriveLifestyleArchetype(
        answers({ "social-gatherings": 2, "social-weeknights": 1, "quiet-schedule": 2 }),
      ),
    ).toBe("open-door");
  });

  it("maps high social answers to open door regardless of schedule", () => {
    expect(
      deriveLifestyleArchetype(
        answers({ "social-gatherings": 2, "social-weeknights": 2, "quiet-schedule": 0 }),
      ),
    ).toBe("open-door");
  });
});
