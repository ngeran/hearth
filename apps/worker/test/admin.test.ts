import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

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
