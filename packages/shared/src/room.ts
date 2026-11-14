import { z } from "zod";
import { lifestyleAnswersSchema } from "./lifestyle";
import { MATCH_TIERS } from "./match";
import {
  areaLabelSchema,
  LIFE_STAGES,
  latitudeSchema,
  longitudeSchema,
  SEEKING_TYPES,
} from "./profile";

/** Bounds mirror docs/specs/M5.md; every input is re-validated here, never trusted. */
export const ROOM_TITLE_MIN_LENGTH = 5;
export const ROOM_TITLE_MAX_LENGTH = 80;
export const ROOM_DESCRIPTION_MIN_LENGTH = 120;
export const ROOM_DESCRIPTION_MAX_LENGTH = 2000;
export const ROOM_RENT_MIN_EUR = 50;
export const ROOM_RENT_MAX_EUR = 5000;
export const ROOM_PHOTO_MAX_COUNT = 3;
export const ROOM_PHOTO_INDEX_MAX = ROOM_PHOTO_MAX_COUNT - 1;
export const ROOMS_LIMIT = 20;

export const ROOM_STATUSES = ["active", "withdrawn"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** Same calendar-date contract as profile move-in dates (YYYY-MM-DD, real date). */
const isCalendarDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

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

export const roomTitleSchema = singleLineText(
  "Listing title",
  ROOM_TITLE_MIN_LENGTH,
  ROOM_TITLE_MAX_LENGTH,
);

/** Newlines are allowed — listings describe rooms, not names. */
export const roomDescriptionSchema = z
  .string()
  .trim()
  .min(
    ROOM_DESCRIPTION_MIN_LENGTH,
    `Description must be at least ${ROOM_DESCRIPTION_MIN_LENGTH} characters.`,
  )
  .max(
    ROOM_DESCRIPTION_MAX_LENGTH,
    `Description must be at most ${ROOM_DESCRIPTION_MAX_LENGTH} characters.`,
  );

export const roomRentEurSchema = z
  .number()
  .int("Rent must be a whole number.")
  .min(ROOM_RENT_MIN_EUR, `Rent must be at least €${ROOM_RENT_MIN_EUR}.`)
  .max(ROOM_RENT_MAX_EUR, `Rent must be at most €${ROOM_RENT_MAX_EUR}.`);

export const roomAvailableFromSchema = calendarDateSchema("Available-from date");
export const roomStatusSchema = z.enum(ROOM_STATUSES);

/** Photo position within a listing (0–2); photoCount is the server's truth. */
export const roomPhotoIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(ROOM_PHOTO_INDEX_MAX, `A listing has at most ${ROOM_PHOTO_MAX_COUNT} photos.`);

export const roomCreateSchema = z
  .object({
    title: roomTitleSchema,
    description: roomDescriptionSchema,
    areaLabel: areaLabelSchema,
    // Nullable like profile coordinates: the form collects a label only and
    // the client passes the lister's profile coords when they exist.
    areaLat: latitudeSchema.nullable(),
    areaLng: longitudeSchema.nullable(),
    rentEur: roomRentEurSchema,
    billsIncluded: z.boolean(),
    availableFrom: roomAvailableFromSchema,
  })
  .strict();

export const roomPatchSchema = z
  .object({
    title: roomTitleSchema.optional(),
    description: roomDescriptionSchema.optional(),
    areaLabel: areaLabelSchema.optional(),
    areaLat: latitudeSchema.optional().nullable(),
    areaLng: longitudeSchema.optional().nullable(),
    rentEur: roomRentEurSchema.optional(),
    billsIncluded: z.boolean().optional(),
    availableFrom: roomAvailableFromSchema.optional(),
    status: roomStatusSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "Provide at least one field.");

export const roomListerSchema = z
  .object({
    userId: z.string().min(1),
    displayName: z.string().min(1),
    verified: z.boolean(),
  })
  .strict();

/**
 * score/tier are computed against the caller and null on self-facing payloads
 * (`/rooms/mine`, own withdrawn listing) where a self-score is meaningless.
 */
export const roomListItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    areaLabel: z.string().min(1),
    rentEur: z.number().int(),
    billsIncluded: z.boolean(),
    availableFrom: z.string().min(10),
    photoCount: z.number().int().min(0).max(ROOM_PHOTO_MAX_COUNT),
    status: roomStatusSchema,
    createdAt: z.number().int(),
    lister: roomListerSchema,
    score: z.number().int().min(0).max(100).nullable(),
    tier: z.enum(MATCH_TIERS).nullable(),
  })
  .strict();

export const roomDetailsSchema = z
  .object({
    ...roomListItemSchema.shape,
    description: z.string().min(1),
    areaLat: latitudeSchema.nullable(),
    areaLng: longitudeSchema.nullable(),
    /** The lister's lifestyle answers let the details view reuse the M3 report. */
    lifestyleAnswers: lifestyleAnswersSchema,
    /** The lister's logistics, same shapes as MatchItem, so the details view
     * can build a full compatibility report without a second endpoint. */
    lifeStage: z.enum(LIFE_STAGES).nullable(),
    seeking: z.enum(SEEKING_TYPES).nullable(),
    budgetMin: z.number().int().nullable(),
    budgetMax: z.number().int().nullable(),
    moveInFrom: z.string().nullable(),
    moveInTo: z.string().nullable(),
    campusId: z.string().nullable(),
    updatedAt: z.number().int(),
  })
  .strict();

export const roomsResponseSchema = z
  .object({
    rooms: z.array(roomListItemSchema),
  })
  .strict();

export const myRoomsResponseSchema = z
  .object({
    rooms: z.array(roomListItemSchema),
  })
  .strict();

export type RoomCreate = z.infer<typeof roomCreateSchema>;
export type RoomPatch = z.infer<typeof roomPatchSchema>;
export type RoomLister = z.infer<typeof roomListerSchema>;
export type RoomListItem = z.infer<typeof roomListItemSchema>;
export type RoomPhotoIndex = z.infer<typeof roomPhotoIndexSchema>;
export type RoomDetails = z.infer<typeof roomDetailsSchema>;
export type RoomsResponse = z.infer<typeof roomsResponseSchema>;
export type MyRoomsResponse = z.infer<typeof myRoomsResponseSchema>;
