import { z } from "zod";

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "./constants";
import { type LifestyleProfile, lifestyleEnvelopeSchema } from "./lifestyle";

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 50;
export const BIO_MIN_LENGTH = 120;
export const BIO_MAX_LENGTH = 300;
export const AREA_LABEL_MIN_LENGTH = 2;
export const AREA_LABEL_MAX_LENGTH = 80;
export const BUDGET_MIN_EUR = 0;
export const BUDGET_MAX_EUR = 10_000;
export const MIN_AGE = 18;
export const COORDINATE_DECIMALS = 2;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIN_DIMENSION = 64;
export const PHOTO_MAX_DIMENSION = 8192;
export const PHOTO_OUTPUT_SIZE = 1024;
export const ACADEMIC_CODE_LENGTH = 6;
export const ACADEMIC_CODE_TTL_SECONDS = 10 * 60;
export const ACADEMIC_CODE_MAX_ATTEMPTS = 5;
export const ACADEMIC_CODE_RESEND_COOLDOWN_SECONDS = 60;
export const ACADEMIC_CODE_HOURLY_LIMIT = 5;
export const ACADEMIC_CODE_HOURLY_WINDOW_SECONDS = 60 * 60;

export const LIFE_STAGES = ["student", "first-time-mover", "independent", "other"] as const;
export type LifeStage = (typeof LIFE_STAGES)[number];

/**
 * Life stages where the university campus question makes sense. Freshers are
 * usually students too, so the campus select is shown for both. The question
 * is hidden (and any stale selection cleared) for everyone else.
 */
export const CAMPUS_LIFE_STAGES = [
  "student",
  "first-time-mover",
] as const satisfies readonly LifeStage[];

export function isCampusLifeStage(stage: LifeStage): boolean {
  return (CAMPUS_LIFE_STAGES as readonly string[]).includes(stage);
}

export const SEEKING_TYPES = ["room", "roommate", "either"] as const;
export type SeekingType = (typeof SEEKING_TYPES)[number];

export const PROFILE_LANGUAGES = SUPPORTED_LANGUAGES;
export type ProfileLanguage = SupportedLanguage;

/**
 * Onboarding fields that must be present before the app opens. Campus and
 * academic verification are optional in M1.
 */
export const ONBOARDING_FIELDS = [
  "displayName",
  "photo",
  "areaLabel",
  "moveIn",
  "budget",
  "seeking",
  "lifeStage",
  "bio",
  "lifestyle",
  "ageConfirmed",
] as const;
export type OnboardingField = (typeof ONBOARDING_FIELDS)[number];

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const calendarDateSchema = (label: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must use YYYY-MM-DD.`)
    .refine(isCalendarDate, `${label} must be a real calendar date.`);

const singleLineText = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`)
    .refine((value) => !/[\r\n\t]/.test(value), `${label} must be a single line.`);

export const displayNameSchema = singleLineText(
  "Display name",
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
);

export const areaLabelSchema = singleLineText("Area", AREA_LABEL_MIN_LENGTH, AREA_LABEL_MAX_LENGTH);

export const bioSchema = z
  .string()
  .trim()
  .min(BIO_MIN_LENGTH, `Bio must be at least ${BIO_MIN_LENGTH} characters.`)
  .max(BIO_MAX_LENGTH, `Bio must be at most ${BIO_MAX_LENGTH} characters.`);

export const moveInDateSchema = calendarDateSchema("Move-in date");
export const budgetAmountSchema = z.number().int().min(BUDGET_MIN_EUR).max(BUDGET_MAX_EUR);

export const latitudeSchema = z.number().finite().min(-90).max(90);
export const longitudeSchema = z.number().finite().min(-180).max(180);

/**
 * Fields a client may change. Photo bytes and academic-email state use their
 * own endpoints and are deliberately absent here.
 */
export const profilePatchSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    areaLabel: areaLabelSchema.optional(),
    areaLat: latitudeSchema.nullable().optional(),
    areaLng: longitudeSchema.nullable().optional(),
    moveInFrom: calendarDateSchema("Move-in start").optional(),
    moveInTo: calendarDateSchema("Move-in end").optional(),
    budgetMin: budgetAmountSchema.optional(),
    budgetMax: budgetAmountSchema.optional(),
    seeking: z.enum(SEEKING_TYPES).optional(),
    lifeStage: z.enum(LIFE_STAGES).optional(),
    campusId: z.string().trim().min(1).max(64).nullable().optional(),
    language: z.enum(PROFILE_LANGUAGES).optional(),
    bio: bioSchema.optional(),
    lifestyle: lifestyleEnvelopeSchema.optional(),
    ageConfirmed: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one profile field.");

export type ProfilePatch = z.infer<typeof profilePatchSchema>;

function addRangeIssues(
  value: { moveInFrom?: string; moveInTo?: string; budgetMin?: number; budgetMax?: number },
  ctx: z.RefinementCtx,
): void {
  if (value.moveInFrom && value.moveInTo && value.moveInFrom > value.moveInTo) {
    ctx.addIssue({
      code: "custom",
      path: ["moveInTo"],
      message: "The move-in start must be before the end date.",
    });
  }

  if (
    value.budgetMin !== undefined &&
    value.budgetMax !== undefined &&
    value.budgetMin > value.budgetMax
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["budgetMax"],
      message: "The minimum budget cannot be higher than the maximum.",
    });
  }
}

/**
 * The client-side onboarding/profile form contract. The server still accepts
 * partial patches so each wizard step can save independently.
 */
export const onboardingFormSchema = z
  .object({
    displayName: displayNameSchema,
    areaLabel: areaLabelSchema,
    moveInFrom: moveInDateSchema,
    moveInTo: moveInDateSchema,
    budgetMin: budgetAmountSchema,
    budgetMax: budgetAmountSchema,
    seeking: z.enum(SEEKING_TYPES),
    lifeStage: z.enum(LIFE_STAGES),
    campusId: z.string().trim().min(1).max(64).nullable(),
    language: z.enum(PROFILE_LANGUAGES),
    bio: bioSchema,
    lifestyle: lifestyleEnvelopeSchema,
    ageConfirmed: z.boolean().refine((value) => value, {
      message: "You must confirm that you are 18 or older.",
    }),
  })
  .strict()
  .superRefine(addRangeIssues);

export type OnboardingFormValues = z.infer<typeof onboardingFormSchema>;

/**
 * The profile edit form: identical to the onboarding contract except the
 * lifestyle envelope is optional. The lifestyle section saves on its own
 * (all ten answers at once), and members without answers must still be able
 * to save every other profile edit.
 */
export const profileFormSchema = z
  .object({
    displayName: displayNameSchema,
    areaLabel: areaLabelSchema,
    moveInFrom: moveInDateSchema,
    moveInTo: moveInDateSchema,
    budgetMin: budgetAmountSchema,
    budgetMax: budgetAmountSchema,
    seeking: z.enum(SEEKING_TYPES),
    lifeStage: z.enum(LIFE_STAGES),
    campusId: z.string().trim().min(1).max(64).nullable(),
    language: z.enum(PROFILE_LANGUAGES),
    bio: bioSchema,
    lifestyle: lifestyleEnvelopeSchema.optional(),
    ageConfirmed: z.boolean().refine((value) => value, {
      message: "You must confirm that you are 18 or older.",
    }),
  })
  .strict()
  .superRefine(addRangeIssues);

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export interface ProfileSnapshot {
  displayName: string | null;
  photoUrl: string | null;
  areaLabel: string | null;
  areaLat: number | null;
  areaLng: number | null;
  moveInFrom: string | null;
  moveInTo: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  seeking: SeekingType | null;
  lifeStage: LifeStage | null;
  campusId: string | null;
  language: ProfileLanguage;
  bio: string | null;
  lifestyle: LifestyleProfile | null;
  ageConfirmed: boolean;
  academicEmail: string | null;
  academicEmailVerifiedAt: number | null;
  onboardingCompletedAt: number | null;
  updatedAt: number;
}

export const profileSnapshotSchema = z.object({
  displayName: z.string().nullable(),
  photoUrl: z.string().nullable(),
  areaLabel: z.string().nullable(),
  areaLat: z.number().nullable(),
  areaLng: z.number().nullable(),
  moveInFrom: z.string().nullable(),
  moveInTo: z.string().nullable(),
  budgetMin: z.number().int().nullable(),
  budgetMax: z.number().int().nullable(),
  seeking: z.enum(SEEKING_TYPES).nullable(),
  lifeStage: z.enum(LIFE_STAGES).nullable(),
  campusId: z.string().nullable(),
  language: z.enum(PROFILE_LANGUAGES),
  bio: z.string().nullable(),
  lifestyle: lifestyleEnvelopeSchema.nullable(),
  ageConfirmed: z.boolean(),
  academicEmail: z.string().nullable(),
  academicEmailVerifiedAt: z.number().int().nullable(),
  onboardingCompletedAt: z.number().int().nullable(),
  updatedAt: z.number().int(),
});

export function getMissingOnboardingFields(profile: ProfileSnapshot): OnboardingField[] {
  const missing: OnboardingField[] = [];
  const displayName = profile.displayName?.trim() ?? "";

  if (
    displayName.length < DISPLAY_NAME_MIN_LENGTH ||
    displayName.length > DISPLAY_NAME_MAX_LENGTH
  ) {
    missing.push("displayName");
  }

  if (!profile.photoUrl) {
    missing.push("photo");
  }

  const areaLabel = profile.areaLabel?.trim() ?? "";
  if (areaLabel.length < AREA_LABEL_MIN_LENGTH || areaLabel.length > AREA_LABEL_MAX_LENGTH) {
    missing.push("areaLabel");
  }

  if (
    !profile.moveInFrom ||
    !profile.moveInTo ||
    !isCalendarDate(profile.moveInFrom) ||
    !isCalendarDate(profile.moveInTo) ||
    profile.moveInFrom > profile.moveInTo
  ) {
    missing.push("moveIn");
  }

  if (
    profile.budgetMin === null ||
    profile.budgetMax === null ||
    profile.budgetMin > profile.budgetMax
  ) {
    missing.push("budget");
  }

  if (!profile.seeking) {
    missing.push("seeking");
  }

  if (!profile.lifeStage) {
    missing.push("lifeStage");
  }

  const bio = profile.bio?.trim() ?? "";
  if (bio.length < BIO_MIN_LENGTH || bio.length > BIO_MAX_LENGTH) {
    missing.push("bio");
  }

  if (!profile.lifestyle) {
    missing.push("lifestyle");
  }

  if (!profile.ageConfirmed) {
    missing.push("ageConfirmed");
  }

  return missing;
}

export function isOnboardingComplete(profile: ProfileSnapshot): boolean {
  return getMissingOnboardingFields(profile).length === 0;
}

/**
 * Approximate locations only: two decimals is roughly 1.1 km of latitude and
 * up to ~2 km of longitude at Greek latitudes. Exact addresses are never stored.
 */
export function coarsenCoordinate(value: number, decimals = COORDINATE_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export const academicEmailRequestSchema = z
  .object({
    email: z.email("Enter a valid email address.").max(254),
  })
  .strict();

export type AcademicEmailRequest = z.infer<typeof academicEmailRequestSchema>;

export const academicEmailVerifySchema = z
  .object({
    code: z
      .string()
      .regex(
        new RegExp(`^\\d{${ACADEMIC_CODE_LENGTH}}$`),
        `Enter the ${ACADEMIC_CODE_LENGTH}-digit code.`,
      ),
  })
  .strict();

export type AcademicEmailVerify = z.infer<typeof academicEmailVerifySchema>;

export const deleteAccountSchema = z
  .object({
    confirmation: z.literal("DELETE"),
  })
  .strict();

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const userResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  name: z.string(),
  image: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const meResponseSchema = z.object({
  user: userResponseSchema,
  profile: profileSnapshotSchema,
  complete: z.boolean(),
  missingFields: z.array(z.enum(ONBOARDING_FIELDS)),
  /** M7: drives the admin entry in the shell; never implies access by itself. */
  isAdmin: z.boolean(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const academicVerificationResponseSchema = z.object({
  email: z.string(),
  verifiedAt: z.number().int().nullable(),
});

export const photoUploadResponseSchema = z.object({
  photoUrl: z.string(),
});

export const exportResponseSchema = z.object({
  exportedAt: z.number().int(),
  user: userResponseSchema,
  profile: profileSnapshotSchema,
  sessions: z.array(
    z.object({
      createdAt: z.number().int(),
      expiresAt: z.number().int(),
      userAgent: z.string().nullable(),
    }),
  ),
  passkeys: z.array(
    z.object({
      name: z.string().nullable(),
      createdAt: z.number().int(),
      deviceType: z.string(),
    }),
  ),
  academicVerification: z
    .object({
      email: z.string(),
      verifiedAt: z.number().int().nullable(),
    })
    .nullable(),
});

export type ExportResponse = z.infer<typeof exportResponseSchema>;

export const DELETION_CONFIRMATION = "DELETE";
