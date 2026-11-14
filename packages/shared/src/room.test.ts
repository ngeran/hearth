import { describe, expect, it } from "vitest";
import { LIFESTYLE_QUESTION_IDS } from "./lifestyle";
import {
  ROOM_PHOTO_MAX_COUNT,
  ROOM_RENT_MAX_EUR,
  ROOM_RENT_MIN_EUR,
  ROOM_TITLE_MAX_LENGTH,
  ROOM_TITLE_MIN_LENGTH,
  roomCreateSchema,
  roomDetailsSchema,
  roomListItemSchema,
  roomPatchSchema,
  roomPhotoIndexSchema,
  roomsResponseSchema,
} from "./room";

const validCreate = () => ({
  title: "Sunny room near the campus",
  description: "A".repeat(120),
  areaLabel: "Zografou, Athens",
  areaLat: 37.97,
  areaLng: 23.78,
  rentEur: 340,
  billsIncluded: true,
  availableFrom: "2026-10-01",
});

const answers = Object.fromEntries(LIFESTYLE_QUESTION_IDS.map((id) => [id, 1]));

const validItem = () => ({
  id: "room-1",
  title: "Sunny room near the campus",
  areaLabel: "Zografou, Athens",
  rentEur: 340,
  billsIncluded: true,
  availableFrom: "2026-10-01",
  photoCount: 0,
  status: "active" as const,
  createdAt: 1790000000,
  lister: { userId: "user-1", displayName: "Giorgos", verified: true },
  score: 92,
  tier: "strong-overlap" as const,
});

describe("roomCreateSchema", () => {
  it("accepts a complete listing", () => {
    expect(roomCreateSchema.safeParse(validCreate()).success).toBe(true);
  });

  it("accepts null coordinates — the form collects a label only", () => {
    const base = validCreate();
    expect(roomCreateSchema.safeParse({ ...base, areaLat: null, areaLng: null }).success).toBe(
      true,
    );
  });

  it("enforces the title bounds after trimming", () => {
    const base = validCreate();
    expect(
      roomCreateSchema.safeParse({ ...base, title: "a".repeat(ROOM_TITLE_MIN_LENGTH - 1) }).success,
    ).toBe(false);
    expect(
      roomCreateSchema.safeParse({ ...base, title: ` ${"a".repeat(ROOM_TITLE_MIN_LENGTH)} ` })
        .success,
    ).toBe(true);
    expect(
      roomCreateSchema.safeParse({ ...base, title: "a".repeat(ROOM_TITLE_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it("rejects multi-line titles", () => {
    const base = validCreate();
    expect(roomCreateSchema.safeParse({ ...base, title: "Two\nlines" }).success).toBe(false);
  });

  it("enforces the description bounds and allows newlines", () => {
    const base = validCreate();
    expect(roomCreateSchema.safeParse({ ...base, description: "short" }).success).toBe(false);
    expect(
      roomCreateSchema.safeParse({ ...base, description: `${"A".repeat(120)}\n${"B".repeat(10)}` })
        .success,
    ).toBe(true);
  });

  it("enforces the rent bounds and integrality", () => {
    const base = validCreate();
    expect(roomCreateSchema.safeParse({ ...base, rentEur: ROOM_RENT_MIN_EUR - 1 }).success).toBe(
      false,
    );
    expect(roomCreateSchema.safeParse({ ...base, rentEur: ROOM_RENT_MAX_EUR + 1 }).success).toBe(
      false,
    );
    expect(roomCreateSchema.safeParse({ ...base, rentEur: 340.5 }).success).toBe(false);
  });

  it("requires a real calendar date", () => {
    const base = validCreate();
    expect(roomCreateSchema.safeParse({ ...base, availableFrom: "2026-02-30" }).success).toBe(
      false,
    );
    expect(roomCreateSchema.safeParse({ ...base, availableFrom: "01-10-2026" }).success).toBe(
      false,
    );
    expect(roomCreateSchema.safeParse({ ...base, availableFrom: "2026-10-01" }).success).toBe(true);
  });

  it("is strict about unknown keys and missing fields", () => {
    expect(roomCreateSchema.safeParse({ ...validCreate(), extra: true }).success).toBe(false);
    const { billsIncluded: _omitted, ...missing } = validCreate();
    expect(roomCreateSchema.safeParse(missing).success).toBe(false);
  });
});

describe("roomPatchSchema", () => {
  it("rejects an empty patch", () => {
    expect(roomPatchSchema.safeParse({}).success).toBe(false);
  });

  it("accepts single-field patches", () => {
    expect(roomPatchSchema.safeParse({ rentEur: 400 }).success).toBe(true);
    expect(roomPatchSchema.safeParse({ status: "withdrawn" }).success).toBe(true);
    expect(roomPatchSchema.safeParse({ billsIncluded: false }).success).toBe(true);
  });

  it("validates patched values and rejects unknown statuses", () => {
    expect(roomPatchSchema.safeParse({ rentEur: 1 }).success).toBe(false);
    expect(roomPatchSchema.safeParse({ status: "paused" }).success).toBe(false);
    expect(roomPatchSchema.safeParse({ title: "no" }).success).toBe(false);
    expect(roomPatchSchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});

describe("roomPhotoIndexSchema", () => {
  it("allows 0..2 and rejects the rest", () => {
    expect(roomPhotoIndexSchema.safeParse(0).success).toBe(true);
    expect(roomPhotoIndexSchema.safeParse(ROOM_PHOTO_MAX_COUNT - 1).success).toBe(true);
    expect(roomPhotoIndexSchema.safeParse(-1).success).toBe(false);
    expect(roomPhotoIndexSchema.safeParse(ROOM_PHOTO_MAX_COUNT).success).toBe(false);
    expect(roomPhotoIndexSchema.safeParse(1.5).success).toBe(false);
  });
});

describe("roomListItemSchema", () => {
  it("accepts a full browse item", () => {
    expect(roomListItemSchema.safeParse(validItem()).success).toBe(true);
  });

  it("accepts null score/tier for self-facing payloads", () => {
    const item = { ...validItem(), score: null, tier: null };
    expect(roomListItemSchema.safeParse(item).success).toBe(true);
  });

  it("rejects out-of-range scores and unknown tiers", () => {
    expect(roomListItemSchema.safeParse({ ...validItem(), score: 101 }).success).toBe(false);
    expect(roomListItemSchema.safeParse({ ...validItem(), tier: "perfect" }).success).toBe(false);
    expect(roomListItemSchema.safeParse({ ...validItem(), photoCount: 4 }).success).toBe(false);
  });
});

describe("roomDetailsSchema", () => {
  it("extends the item with description, coordinates and lifestyle answers", () => {
    const details = {
      ...validItem(),
      description: "A".repeat(120),
      areaLat: 37.97,
      areaLng: 23.78,
      lifestyleAnswers: answers,
      lifeStage: "student",
      seeking: "roommate",
      budgetMin: 300,
      budgetMax: 500,
      moveInFrom: "2027-01-01",
      moveInTo: "2027-04-01",
      campusId: null,
      updatedAt: 1790000100,
    };
    expect(roomDetailsSchema.safeParse(details).success).toBe(true);
  });

  it("requires all ten lifestyle answers", () => {
    const details = {
      ...validItem(),
      description: "A".repeat(120),
      areaLat: 37.97,
      areaLng: 23.78,
      lifestyleAnswers: { ...answers, "guests-partner": undefined },
      lifeStage: null,
      seeking: null,
      budgetMin: null,
      budgetMax: null,
      moveInFrom: null,
      moveInTo: null,
      campusId: null,
      updatedAt: 1790000100,
    };
    expect(roomDetailsSchema.safeParse(details).success).toBe(false);
  });
});

describe("roomsResponseSchema", () => {
  it("parses an array of items and stays strict", () => {
    expect(roomsResponseSchema.safeParse({ rooms: [validItem()] }).success).toBe(true);
    expect(roomsResponseSchema.safeParse({ rooms: [] }).success).toBe(true);
    expect(roomsResponseSchema.safeParse({ rooms: [], extra: 1 }).success).toBe(false);
  });
});
