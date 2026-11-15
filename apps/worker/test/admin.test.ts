import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { adminUserDetailSchema } from "@hearth/shared";
import { beforeAll, describe, expect, it } from "vitest";

import m0000 from "../../../migrations/0000_initial.sql?raw";
import m0001 from "../../../migrations/0001_auth_profiles.sql?raw";
import m0002 from "../../../migrations/0002_academic_challenge_unique.sql?raw";
import m0003 from "../../../migrations/0003_lifestyle.sql?raw";
import m0004 from "../../../migrations/0004_chat_threads.sql?raw";
import m0005 from "../../../migrations/0005_rooms.sql?raw";
import m0006 from "../../../migrations/0006_push_subscriptions.sql?raw";
import m0007 from "../../../migrations/0007_admin_ops.sql?raw";

import { isAdminEmail, parseAdminEmails, scrubErrorMessage } from "../src/lib/admin";

describe("parseAdminEmails", () => {
  it("splits, trims and lowercases the allowlist", () => {
    expect([...parseAdminEmails(" Admin@Example.com , second@example.com ")]).toEqual([
      "admin@example.com",
      "second@example.com",
    ]);
  });

  it("fails closed for missing or empty values", () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails(" , , ").size).toBe(0);
  });
});

describe("isAdminEmail", () => {
  it("matches case-insensitively", () => {
    expect(isAdminEmail({ ADMIN_EMAILS: "Ada@Example.com" }, "ada@example.com")).toBe(true);
    expect(isAdminEmail({ ADMIN_EMAILS: "Ada@Example.com" }, "bo@example.com")).toBe(false);
  });

  it("allows nobody when the binding is unset", () => {
    expect(isAdminEmail({}, "ada@example.com")).toBe(false);
  });
});

describe("scrubErrorMessage", () => {
  it("redacts email addresses", () => {
    expect(scrubErrorMessage("Could not send to ada@example.com")).toBe(
      "Could not send to [email]",
    );
  });

  it("redacts long token-like runs", () => {
    const token = "a".repeat(40);
    expect(scrubErrorMessage(`token ${token} rejected`)).toBe("token [redacted] rejected");
  });

  it("collapses whitespace and caps the message", () => {
    const scrubbed = scrubErrorMessage(`line one\n\n  line two ${"word ".repeat(100)}`);
    expect(scrubbed.includes("\n")).toBe(false);
    expect(scrubbed.length).toBe(200);
  });
});

describe("admin routes", () => {
  it("returns the standard 404 to signed-out callers", async () => {
    const response = await SELF.fetch("https://hearth.test/api/v1/admin/overview");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "not_found",
        message: "The requested resource was not found.",
      },
    });
  });

  it("returns the standard 404 for admin mutations too", async () => {
    const response = await SELF.fetch(
      "https://hearth.test/api/v1/admin/users/unknown/sessions/revoke",
      { method: "POST" },
    );

    expect(response.status).toBe(404);
  });
});

/**
 * Sign a session token the way Better Auth does (HMAC-SHA256, base64) so the
 * integration test exercises the real `requireAdmin` + `requireSession` path
 * without the email-OTP round trip.
 */
async function sessionCookie(token: string): Promise<string> {
  const secret = "hearth-worker-test-secret-not-production";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `__Secure-better-auth.session_token=${token}.${encoded}`;
}

describe("GET /api/v1/admin/users/:id", () => {
  // The test D1 starts empty; apply the real migrations, then seed synthetic rows.
  beforeAll(async () => {
    const statements = (sql: string) =>
      sql
        .split(";\n")
        .map((query) => query.trim())
        .filter(Boolean);
    await applyD1Migrations(env.DB, [
      { name: "0000_initial", queries: statements(m0000) },
      { name: "0001_auth_profiles", queries: statements(m0001) },
      { name: "0002_academic_challenge_unique", queries: statements(m0002) },
      { name: "0003_lifestyle", queries: statements(m0003) },
      { name: "0004_chat_threads", queries: statements(m0004) },
      { name: "0005_rooms", queries: statements(m0005) },
      { name: "0006_push_subscriptions", queries: statements(m0006) },
      { name: "0007_admin_ops", queries: statements(m0007) },
    ]);

    const now = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
      ).bind("admin-1", "Admin", "admin@example.com", now, now),
      env.DB.prepare(
        "INSERT INTO profiles (user_id, display_name, language, age_confirmed, created_at, updated_at) VALUES (?, ?, 'en', 0, ?, ?)",
      ).bind("admin-1", "Ada", now, now),
      env.DB.prepare(
        "INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind("session-1", now + 3600, "test-session-token", now, now, "admin-1"),
    ]);
  });

  it("returns the missing-profile reasons from the shared rule", async () => {
    const response = await SELF.fetch("https://hearth.test/api/v1/admin/users/admin-1", {
      headers: { cookie: await sessionCookie("test-session-token") },
    });

    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    const detail = adminUserDetailSchema.parse(body);
    expect(detail.missingProfileFields).toEqual([
      "photo",
      "areaLabel",
      "moveIn",
      "budget",
      "seeking",
      "lifeStage",
      "bio",
      "lifestyle",
      "ageConfirmed",
    ]);
  });
});
