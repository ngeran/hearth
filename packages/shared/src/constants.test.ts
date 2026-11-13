import { describe, expect, it } from "vitest";

import { MATCH_POOL_THRESHOLD, SUPPORTED_LANGUAGES } from "./constants";

describe("shared constants", () => {
  it("uses the launch matching threshold from the product brief", () => {
    expect(MATCH_POOL_THRESHOLD).toBe(500);
  });

  it("ships both launch languages", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "el"]);
  });
});
