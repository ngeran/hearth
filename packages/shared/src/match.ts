import { z } from "zod";

import {
  LIFESTYLE_DIMENSIONS,
  LIFESTYLE_QUESTION_IDS,
  LIFESTYLE_QUESTIONS,
  type LifestyleAnswerLevel,
  type LifestyleAnswers,
  type LifestyleDimension,
  type LifestyleQuestionId,
  lifestyleAnswersSchema,
} from "./lifestyle";
import { LIFE_STAGES, SEEKING_TYPES, type SeekingType } from "./profile";

/**
 * The M3 matching engine. Everything here is pure and deterministic so the
 * exact same code runs in unit tests, the Worker, and (for rendering the
 * report) the client. Nothing about matching is persisted per pair; scores
 * are computed on read (revisit at `MATCH_POOL_THRESHOLD`).
 */

export const COMPAT_STRONG_THRESHOLD = 75;
export const COMPAT_CHAT_THRESHOLD = 50;
/**
 * Stored coordinates are coarsened to 2 decimals, so candidate deltas are
 * multiples of 0.01 with float noise. The epsilon keeps the documented
 * boundary "|Δ| ≤ 0.05" inclusive under floating point (0.07 − 0.02 is
 * 0.05000000000000256, which must still match).
 */
export const AREA_MATCH_TOLERANCE = 0.05;
export const MATCHES_LIMIT = 20;

const AREA_MATCH_EPSILON = 1e-9;

export const MATCH_TIERS = ["strong-overlap", "worth-a-chat", "likely-friction"] as const;
export type MatchTier = (typeof MATCH_TIERS)[number];

/** Per-dimension percentages (0–100), the report's five rows. */
export type DimensionScores = { [K in LifestyleDimension]: number };

export interface CompatibilityScore {
  readonly score: number;
  readonly tier: MatchTier;
  readonly dimensionScores: DimensionScores;
  readonly sharedQuestions: readonly LifestyleQuestionId[];
  readonly frictionQuestions: readonly LifestyleQuestionId[];
}

function compatTier(score: number): MatchTier {
  if (score >= COMPAT_STRONG_THRESHOLD) {
    return "strong-overlap";
  }
  return score >= COMPAT_CHAT_THRESHOLD ? "worth-a-chat" : "likely-friction";
}

/**
 * Distance → weight per question: same answer 1.0, adjacent 0.5, opposite 0.
 * Every question weighs 10% — no hidden weights, so "82% and here's why"
 * stays answerable in one sentence (a product pillar).
 */
function answerWeight(a: LifestyleAnswerLevel, b: LifestyleAnswerLevel): number {
  const distance = Math.abs(a - b);
  return distance === 0 ? 1 : distance === 1 ? 0.5 : 0;
}

/**
 * Pure, symmetric lifestyle compatibility. Identical answers score 100,
 * opposite on everything scores 0; swapping the two people changes nothing.
 * With ten questions the score is always a multiple of 5.
 */
export function scoreCompatibility(a: LifestyleAnswers, b: LifestyleAnswers): CompatibilityScore {
  const sharedQuestions: LifestyleQuestionId[] = [];
  const frictionQuestions: LifestyleQuestionId[] = [];
  const weightsByDimension = new Map<LifestyleDimension, number[]>();
  let totalWeight = 0;

  for (const question of LIFESTYLE_QUESTIONS) {
    const weight = answerWeight(a[question.id], b[question.id]);
    totalWeight += weight;

    const dimensionWeights = weightsByDimension.get(question.dimension);
    if (dimensionWeights) {
      dimensionWeights.push(weight);
    } else {
      weightsByDimension.set(question.dimension, [weight]);
    }

    if (weight === 1) {
      sharedQuestions.push(question.id);
    } else if (weight === 0) {
      frictionQuestions.push(question.id);
    }
  }

  const dimensionScores: DimensionScores = {
    "social-rhythm": 0,
    cleanliness: 0,
    "kitchen-sharing": 0,
    "quiet-hours": 0,
    "guests-partners": 0,
  };
  for (const dimension of LIFESTYLE_DIMENSIONS) {
    const weights = weightsByDimension.get(dimension);
    dimensionScores[dimension] = weights
      ? Math.round((weights.reduce((sum, weight) => sum + weight, 0) / weights.length) * 100)
      : 0;
  }

  const score = Math.round((totalWeight / LIFESTYLE_QUESTION_IDS.length) * 100);

  return { score, tier: compatTier(score), dimensionScores, sharedQuestions, frictionQuestions };
}

/**
 * The logistics fields the eligibility gates read. `ProfileSnapshot` satisfies
 * this interface structurally, so the route passes snapshots straight in.
 * Gate 1 of the spec (not you, onboarding complete, active account) is
 * enforced by the route's SQL prefilter and caller completeness check —
 * it is not a data gate.
 */
export interface MatchCandidate {
  readonly seeking: SeekingType | null;
  readonly budgetMin: number | null;
  readonly budgetMax: number | null;
  readonly moveInFrom: string | null;
  readonly moveInTo: string | null;
  readonly areaLat: number | null;
  readonly areaLng: number | null;
  readonly campusId: string | null;
}

function seekingCompatible(a: SeekingType | null, b: SeekingType | null): boolean {
  if (a === null || b === null) {
    return true;
  }
  // The pair can share a home when at least one side is flexible ("either")
  // or the two needs complement each other (a room + someone seeking a
  // roommate). Two identical one-sided needs cannot help each other; teaming
  // up with peers is M5.
  return a === "either" || b === "either" || a !== b;
}

function budgetsOverlap(me: MatchCandidate, candidate: MatchCandidate): boolean {
  if (
    me.budgetMin === null ||
    me.budgetMax === null ||
    candidate.budgetMin === null ||
    candidate.budgetMax === null
  ) {
    return true;
  }
  return me.budgetMin <= candidate.budgetMax && candidate.budgetMin <= me.budgetMax;
}

function windowsOverlap(me: MatchCandidate, candidate: MatchCandidate): boolean {
  if (
    me.moveInFrom === null ||
    me.moveInTo === null ||
    candidate.moveInFrom === null ||
    candidate.moveInTo === null
  ) {
    return true;
  }
  // YYYY-MM-DD compares correctly as plain strings.
  return me.moveInFrom <= candidate.moveInTo && candidate.moveInFrom <= me.moveInTo;
}

function areasOverlap(me: MatchCandidate, candidate: MatchCandidate): boolean {
  if (me.campusId !== null && me.campusId === candidate.campusId) {
    return true;
  }
  if (
    me.areaLat === null ||
    me.areaLng === null ||
    candidate.areaLat === null ||
    candidate.areaLng === null
  ) {
    return true;
  }
  const latitudeClose =
    Math.abs(me.areaLat - candidate.areaLat) <= AREA_MATCH_TOLERANCE + AREA_MATCH_EPSILON;
  const longitudeClose =
    Math.abs(me.areaLng - candidate.areaLng) <= AREA_MATCH_TOLERANCE + AREA_MATCH_EPSILON;
  return latitudeClose && longitudeClose;
}

/**
 * Eligibility gates: who may appear in your list at all. Gates never touch
 * the score; missing data never fails a gate (complete profiles always have
 * these fields — the tolerance is defensive, e.g. for legacy rows).
 */
export function matchEligibility(me: MatchCandidate, candidate: MatchCandidate): boolean {
  return (
    seekingCompatible(me.seeking, candidate.seeking) &&
    budgetsOverlap(me, candidate) &&
    windowsOverlap(me, candidate) &&
    areasOverlap(me, candidate)
  );
}

/**
 * Derived from their answers, never stored. At most three, in question
 * order, so the calmest facts surface first.
 */
export const HABIT_TAG_IDS = [
  "social-host",
  "very-tidy",
  "relaxed-tidy",
  "home-cook",
  "early-bird",
  "night-owl",
] as const;
export type HabitTagId = (typeof HABIT_TAG_IDS)[number];

const HABIT_TAG_RULES: readonly {
  question: LifestyleQuestionId;
  level: LifestyleAnswerLevel;
  tag: HabitTagId;
}[] = [
  // In question order on purpose: the first three matches win the max-3 slots.
  { question: "social-gatherings", level: 2, tag: "social-host" },
  { question: "clean-tidy", level: 0, tag: "very-tidy" },
  { question: "clean-tidy", level: 2, tag: "relaxed-tidy" },
  { question: "kitchen-cooking", level: 0, tag: "home-cook" },
  { question: "quiet-schedule", level: 0, tag: "early-bird" },
  { question: "quiet-schedule", level: 2, tag: "night-owl" },
];

export function deriveHabitTags(answers: LifestyleAnswers): HabitTagId[] {
  const tags: HabitTagId[] = [];
  for (const rule of HABIT_TAG_RULES) {
    if (answers[rule.question] === rule.level && tags.length < 3) {
      tags.push(rule.tag);
    }
  }
  return tags;
}

const dimensionScoresSchema = z
  .object({
    "social-rhythm": z.number().int().min(0).max(100),
    cleanliness: z.number().int().min(0).max(100),
    "kitchen-sharing": z.number().int().min(0).max(100),
    "quiet-hours": z.number().int().min(0).max(100),
    "guests-partners": z.number().int().min(0).max(100),
  })
  .strict();

/**
 * One entry in the caller's match list. `lifestyleAnswers` travels as the ten
 * answer levels so the client can render "You: label · Them: label" per
 * dimension with the existing question copy — the raw grid is never shown.
 */
export const matchItemSchema = z
  .object({
    userId: z.string().min(1),
    displayName: z.string().min(1),
    areaLabel: z.string().nullable(),
    lifeStage: z.enum(LIFE_STAGES).nullable(),
    seeking: z.enum(SEEKING_TYPES).nullable(),
    budgetMin: z.number().int().nullable(),
    budgetMax: z.number().int().nullable(),
    moveInFrom: z.string().nullable(),
    moveInTo: z.string().nullable(),
    campusId: z.string().nullable(),
    score: z.number().int().min(0).max(100),
    tier: z.enum(MATCH_TIERS),
    dimensionScores: dimensionScoresSchema,
    sharedQuestions: z.array(z.enum(LIFESTYLE_QUESTION_IDS)),
    frictionQuestions: z.array(z.enum(LIFESTYLE_QUESTION_IDS)),
    habitTags: z.array(z.enum(HABIT_TAG_IDS)),
    lifestyleAnswers: lifestyleAnswersSchema,
  })
  .strict();

export const matchesResponseSchema = z
  .object({
    matches: z.array(matchItemSchema),
  })
  .strict();

export type MatchItem = z.infer<typeof matchItemSchema>;
export type MatchesResponse = z.infer<typeof matchesResponseSchema>;
