import {
  ACADEMIC_CODE_LENGTH,
  LIFE_STAGES,
  type LifeStage,
  type ProfileLanguage,
  type ProfilePatch,
  SEEKING_TYPES,
  type SeekingType,
} from "@hearth/shared";

import type { Env } from "../env";
import { getTestOtp } from "./test-otp";

const CODE_MODULO = 10 ** ACADEMIC_CODE_LENGTH;

export function generateAcademicCode(env: Env): string {
  const fixed = getTestOtp(env);

  if (fixed) {
    return fixed;
  }

  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  const value = values[0] ?? 0;

  return String(value % CODE_MODULO).padStart(ACADEMIC_CODE_LENGTH, "0");
}

export async function hashAcademicCode(
  secret: string,
  userId: string,
  email: string,
  code: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${userId}:${email.toLowerCase()}:${code}`),
  );

  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}

export function preferredLanguageFromHeader(header: string | undefined): ProfileLanguage {
  return header?.toLowerCase().startsWith("el") ? "el" : "en";
}

export function asLifeStage(value: string | null): LifeStage | null {
  return LIFE_STAGES.find((stage) => stage === value) ?? null;
}

export function asSeeking(value: string | null): SeekingType | null {
  return SEEKING_TYPES.find((seeking) => seeking === value) ?? null;
}

export function asLanguage(value: string): ProfileLanguage {
  return value === "el" ? "el" : "en";
}

export function hasPatch<K extends keyof ProfilePatch>(patch: ProfilePatch, key: K): boolean {
  return Object.hasOwn(patch, key);
}
