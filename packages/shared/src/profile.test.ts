import { describe, expect, it } from "vitest";

import {
  BIO_MAX_LENGTH,
  BIO_MIN_LENGTH,
  coarsenCoordinate,
  deleteAccountSchema,
  getMissingOnboardingFields,
  isOnboardingComplete,
  type ProfileSnapshot,
  profilePatchSchema,
} from "./profile";

function completeProfile(overrides: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
  return {
    displayName: "Eleni",
    photoUrl: "/api/v1/me/photo?v=1",
    areaLabel: "Koukaki, Athens",
    areaLat: 37.96,
    areaLng: 23.73,
    moveInFrom: "2027-09-01",
    moveInTo: "2027-10-31",
    budgetMin: 350,
    budgetMax: 550,
    seeking: "room",
    lifeStage: "student",
    campusId: "campus-nkua",
    language: "en",
    bio: "a".repeat(BIO_MIN_LENGTH),
    ageConfirmed: true,
    academicEmail: null,
    academicEmailVerifiedAt: null,
    onboardingCompletedAt: null,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

describe("profile contract", () => {
  it("accepts a complete onboarding profile", () => {
    expect(isOnboardingComplete(completeProfile())).toBe(true);
    expect(getMissingOnboardingFields(completeProfile())).toEqual([]);
  });

  it("reports every missing onboarding field", () => {
    const missing = getMissingOnboardingFields(
      completeProfile({
        displayName: null,
        photoUrl: null,
        areaLabel: null,
        moveInFrom: null,
        moveInTo: null,
        budgetMin: null,
        budgetMax: null,
        seeking: null,
        lifeStage: null,
        bio: null,
        ageConfirmed: false,
      }),
    );

    expect(missing).toEqual([
      "displayName",
      "photo",
      "areaLabel",
      "moveIn",
      "budget",
      "seeking",
      "lifeStage",
      "bio",
      "ageConfirmed",
    ]);
  });

  it("rejects inverted move-in and budget ranges", () => {
    expect(
      getMissingOnboardingFields(
        completeProfile({ moveInFrom: "2027-11-01", moveInTo: "2027-10-31" }),
      ),
    ).toContain("moveIn");
    expect(
      getMissingOnboardingFields(completeProfile({ budgetMin: 600, budgetMax: 500 })),
    ).toContain("budget");
  });

  it("trims and bounds the bio", () => {
    expect(profilePatchSchema.safeParse({ bio: "a".repeat(BIO_MIN_LENGTH - 1) }).success).toBe(
      false,
    );
    expect(profilePatchSchema.safeParse({ bio: "a".repeat(BIO_MAX_LENGTH + 1) }).success).toBe(
      false,
    );
    expect(profilePatchSchema.safeParse({ bio: `  ${"a".repeat(BIO_MIN_LENGTH)}  ` }).success).toBe(
      true,
    );
  });

  it("rejects unknown keys and empty patches", () => {
    expect(profilePatchSchema.safeParse({}).success).toBe(false);
    expect(profilePatchSchema.safeParse({ admin: true }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ displayName: "Eleni" }).success).toBe(true);
  });

  it("validates calendar dates and enum values", () => {
    expect(profilePatchSchema.safeParse({ moveInFrom: "2027-02-29" }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ moveInFrom: "2028-02-29" }).success).toBe(true);
    expect(profilePatchSchema.safeParse({ seeking: "castle" }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ lifeStage: "student" }).success).toBe(true);
  });

  it("only accepts the exact deletion confirmation", () => {
    expect(deleteAccountSchema.safeParse({ confirmation: "DELETE" }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ confirmation: "delete" }).success).toBe(false);
  });

  it("coarsens coordinates to about two kilometres", () => {
    expect(coarsenCoordinate(37.98381)).toBe(37.98);
    expect(coarsenCoordinate(23.72751)).toBe(23.73);
  });
});
