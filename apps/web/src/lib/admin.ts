import {
  type AdminDeleteUser,
  type AdminErrorsResponse,
  type AdminOverview,
  type AdminRevokeSessionsResponse,
  type AdminRoomsResponse,
  type AdminUserDetail,
  type AdminUsersResponse,
  adminDeleteRoomResponseSchema,
  adminDeleteUserResponseSchema,
  adminDeleteUserSchema,
  adminErrorsResponseSchema,
  adminOverviewSchema,
  adminRevokeSessionsResponseSchema,
  adminRoomsResponseSchema,
  adminUserDetailSchema,
  adminUsersResponseSchema,
} from "@hearth/shared";

import type { z } from "zod";

import { requestJson } from "./me";

/**
 * Admin console fetchers (docs/specs/M7.md). Every response is parsed with the
 * shared schema; a non-admin receives 404 and surfaces as `ApiRequestError`
 * with status 404, which the shell turns into the standard not-found page.
 */

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });

  return requestJson(response, schema);
}

export function fetchAdminOverview(): Promise<AdminOverview> {
  return getJson("/api/v1/admin/overview", adminOverviewSchema);
}

export function fetchAdminUsers(params: {
  query?: string | undefined;
  offset?: number | undefined;
}): Promise<AdminUsersResponse> {
  return getJson(
    `/api/v1/admin/users${queryString({ query: params.query, offset: params.offset })}`,
    adminUsersResponseSchema,
  );
}

export function fetchAdminUser(id: string): Promise<AdminUserDetail> {
  return getJson(`/api/v1/admin/users/${encodeURIComponent(id)}`, adminUserDetailSchema);
}

export function fetchAdminErrors(params: {
  route?: string | undefined;
  status?: number | undefined;
  offset?: number | undefined;
  limit?: number | undefined;
}): Promise<AdminErrorsResponse> {
  return getJson(`/api/v1/admin/errors${queryString(params)}`, adminErrorsResponseSchema);
}

export function fetchAdminRooms(params: {
  status?: "active" | "withdrawn" | undefined;
  query?: string | undefined;
  offset?: number | undefined;
}): Promise<AdminRoomsResponse> {
  return getJson(`/api/v1/admin/rooms${queryString(params)}`, adminRoomsResponseSchema);
}

async function postJson<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  return requestJson(response, schema);
}

export function revokeAdminUserSessions(id: string): Promise<AdminRevokeSessionsResponse> {
  return postJson(
    `/api/v1/admin/users/${encodeURIComponent(id)}/sessions/revoke`,
    undefined,
    adminRevokeSessionsResponseSchema,
  );
}

export function deleteAdminUser(id: string, confirmEmail: string): Promise<{ deleted: true }> {
  const body: AdminDeleteUser = adminDeleteUserSchema.parse({ confirmEmail });

  return postJson(
    `/api/v1/admin/users/${encodeURIComponent(id)}/delete`,
    body,
    adminDeleteUserResponseSchema,
  );
}

export function deleteAdminRoom(id: string): Promise<{ deleted: true }> {
  return postJson(
    `/api/v1/admin/rooms/${encodeURIComponent(id)}/delete`,
    undefined,
    adminDeleteRoomResponseSchema,
  );
}
