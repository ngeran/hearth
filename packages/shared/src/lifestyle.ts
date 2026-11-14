import { z } from "zod";

/**
 * The lifestyle questionnaire (M2). Ten fixed ordinal questions across five
 * dimensions: the data the M3 matching engine scores. Question wording lives
 * in the locale files keyed by these ids; this module owns ids, levels and
 * validation only, so scoring stays deterministic and language-independent.
 */

export const LIFESTYLE_VERSION = 1;

export const LIFESTYLE_DIMENSIONS = [
  "social-rhythm",
  "cleanliness",
  "kitchen-sharing",
  "quiet-hours",
  "guests-partners",
] as const;
export type LifestyleDimension = (typeof LIFESTYLE_DIMENSIONS)[number];

/** Every question offers exactly three neutral options; no "right" answer. */
export const LIFESTYLE_ANSWER_LEVELS = [0, 1, 2] as const;
export type LifestyleAnswerLevel = (typeof LIFESTYLE_ANSWER_LEVELS)[number];

export const LIFESTYLE_QUESTION_IDS = [
  "social-gatherings",
  "social-weeknights",
  "clean-tidy",
  "clean-shared",
  "kitchen-cooking",
  "kitchen-sharing",
  "quiet-schedule",
  "quiet-noise",
  "guests-overnight",
  "guests-partner",
] as const;
export type LifestyleQuestionId = (typeof LIFESTYLE_QUESTION_IDS)[number];

export interface LifestyleQuestion {
  readonly id: LifestyleQuestionId;
  readonly dimension: LifestyleDimension;
  /** Presentation order in the questionnaire; groups follow the dimensions. */
  readonly order: number;
}

export const LIFESTYLE_QUESTIONS: readonly LifestyleQuestion[] = [
  { id: "social-gatherings", dimension: "social-rhythm", order: 0 },
  { id: "social-weeknights", dimension: "social-rhythm", order: 1 },
  { id: "clean-tidy", dimension: "cleanliness", order: 2 },
  { id: "clean-shared", dimension: "cleanliness", order: 3 },
  { id: "kitchen-cooking", dimension: "kitchen-sharing", order: 4 },
  { id: "kitchen-sharing", dimension: "kitchen-sharing", order: 5 },
  { id: "quiet-schedule", dimension: "quiet-hours", order: 6 },
  { id: "quiet-noise", dimension: "quiet-hours", order: 7 },
  { id: "guests-overnight", dimension: "guests-partners", order: 8 },
  { id: "guests-partner", dimension: "guests-partners", order: 9 },
];

const answerLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

/**
 * All-or-nothing: every question must be answered in one save. Partial saves
 * would let members appear in later scoring with missing data.
 */
export const lifestyleAnswersSchema = z
  .object({
    "social-gatherings": answerLevelSchema,
    "social-weeknights": answerLevelSchema,
    "clean-tidy": answerLevelSchema,
    "clean-shared": answerLevelSchema,
    "kitchen-cooking": answerLevelSchema,
    "kitchen-sharing": answerLevelSchema,
    "quiet-schedule": answerLevelSchema,
    "quiet-noise": answerLevelSchema,
    "guests-overnight": answerLevelSchema,
    "guests-partner": answerLevelSchema,
  })
  .strict();

export type LifestyleAnswers = z.infer<typeof lifestyleAnswersSchema>;

/**
 * The persisted envelope. The version field lets questions evolve without
 * destructive migrations; unknown future versions read back as `null` until
 * they are migrated, never as silently wrong data.
 */
export const lifestyleEnvelopeSchema = z
  .object({
    version: z.literal(LIFESTYLE_VERSION),
    answers: lifestyleAnswersSchema,
  })
  .strict();

export type LifestyleProfile = z.infer<typeof lifestyleEnvelopeSchema>;

/**
 * Defensive read of the `profiles.lifestyle_json` column. Damaged or
 * out-of-version rows read as "not answered" instead of throwing; the member
 * can simply answer again. Never logs the row contents.
 */
export function parseStoredLifestyle(json: string | null): LifestyleProfile | null {
  if (json === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(json);
    const result = lifestyleEnvelopeSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const LIFESTYLE_ARCHETYPES = [
  "night-owl-haven",
  "quiet-mornings",
  "calm-sanctuary",
  "steady-rhythm",
  "open-door",
] as const;
export type LifestyleArchetype = (typeof LIFESTYLE_ARCHETYPES)[number];

/**
 * Pure derivation, never persisted, so it can never go stale. The rule is
 * explainable in one sentence: members whose evenings run late and who are
 * not strongly social are Night Owl Havens; otherwise the social rhythm
 * decides, with early-and-quiet members as Quiet Mornings.
 */
export function deriveLifestyleArchetype(answers: LifestyleAnswers): LifestyleArchetype {
  const socialScore = answers["social-gatherings"] + answers["social-weeknights"];

  if (answers["quiet-schedule"] === 2 && socialScore <= 2) {
    return "night-owl-haven";
  }

  if (socialScore <= 1) {
    return answers["quiet-schedule"] === 0 ? "quiet-mornings" : "calm-sanctuary";
  }

  return socialScore === 2 ? "steady-rhythm" : "open-door";
}
