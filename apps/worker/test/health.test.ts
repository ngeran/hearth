import { env, SELF } from "cloudflare:test";
import { healthResponseSchema } from "@hearth/shared";
import { describe, expect, it } from "vitest";

describe("GET /api/v1/health", () => {
  it("returns a validated health payload", async () => {
    const response = await SELF.fetch("https://hearth.test/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const payload = healthResponseSchema.parse(await response.json());
    expect(payload.status).toBe("ok");
    expect(payload.timestamp).toBeGreaterThan(0);
  });

  it("sets baseline security headers", async () => {
    const response = await SELF.fetch("https://hearth.test/api/v1/health");

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("can reach the D1 binding", async () => {
    const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();

    expect(row?.ok).toBe(1);
  });

  it("returns the shared error shape for unknown routes", async () => {
    const response = await SELF.fetch("https://hearth.test/api/v1/does-not-exist");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "not_found",
        message: "The requested resource was not found.",
      },
    });
  });
});
