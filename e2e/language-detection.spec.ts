import { expect, test } from "@playwright/test";

test.use({ locale: "el-GR" });

test("defaults to Greek for a Greek browser", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ένας πιο ήρεμος");
  await expect(page.locator("html")).toHaveAttribute("lang", "el");
});
