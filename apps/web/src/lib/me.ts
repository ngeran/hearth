import {
  academicVerificationResponseSchema,
  apiErrorSchema,
  type CampusesResponse,
  campusesResponseSchema,
  type MeResponse,
  meResponseSchema,
  type ProfilePatch,
  photoUploadResponseSchema,
} from "@hearth/shared";
import type { z } from "zod";

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

async function readError(response: Response): Promise<ApiRequestError> {
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());

    if (parsed.success) {
      return new ApiRequestError(parsed.data.error.code, response.status);
    }
  } catch {
    // Fall through to a generic code; the raw body is never shown to the user.
  }

  return new ApiRequestError("request_failed", response.status);
}

async function requestJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    throw await readError(response);
  }

  return schema.parse(await response.json());
}

export async function fetchMe(): Promise<MeResponse> {
  const response = await fetch("/api/v1/me", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });

  return requestJson(response, meResponseSchema);
}

export async function updateMe(patch: ProfilePatch): Promise<MeResponse> {
  const response = await fetch("/api/v1/me", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(patch),
  });

  return requestJson(response, meResponseSchema);
}

export async function uploadPhoto(photo: Blob): Promise<{ photoUrl: string }> {
  const response = await fetch("/api/v1/me/photo", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "image/jpeg", accept: "application/json" },
    body: photo,
  });

  return requestJson(response, photoUploadResponseSchema);
}

export async function deletePhoto(): Promise<void> {
  const response = await fetch("/api/v1/me/photo", {
    method: "DELETE",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw await readError(response);
  }
}

export async function fetchCampuses(): Promise<CampusesResponse> {
  const response = await fetch("/api/v1/campuses", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });

  return requestJson(response, campusesResponseSchema);
}

export async function sendAcademicCode(
  email: string,
): Promise<{ email: string; verifiedAt: number | null }> {
  const response = await fetch("/api/v1/me/academic-email", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email }),
  });

  return requestJson(response, academicVerificationResponseSchema);
}

export async function verifyAcademicCode(
  code: string,
): Promise<{ email: string; verifiedAt: number | null }> {
  const response = await fetch("/api/v1/me/academic-email/verify", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ code }),
  });

  return requestJson(response, academicVerificationResponseSchema);
}

export async function downloadExport(): Promise<void> {
  const response = await fetch("/api/v1/me/export", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw await readError(response);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  anchor.href = url;
  anchor.download = match?.[1] ?? "hearth-export.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function deleteAccount(): Promise<void> {
  const response = await fetch("/api/v1/me", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ confirmation: "DELETE" }),
  });

  if (!response.ok) {
    throw await readError(response);
  }
}
