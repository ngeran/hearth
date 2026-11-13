import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "./health";

describe("healthResponseSchema", () => {
  it("accepts the public health payload", () => {
    const parsed = healthResponseSchema.parse({
      status: "ok",
      service: "hearth",
      timestamp: 1_800_000_000,
    });

    expect(parsed).toEqual({
      status: "ok",
      service: "hearth",
      timestamp: 1_800_000_000,
    });
  });

  it("rejects timestamps that are not whole unix seconds", () => {
    expect(() =>
      healthResponseSchema.parse({
        status: "ok",
        service: "hearth",
        timestamp: 1_800_000_000.5,
      }),
    ).toThrow();
  });
});
