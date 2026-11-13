import { expect, test } from "@playwright/test";

test("loads the app shell and reaches the API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("A calmer way");
  await expect(page.getByRole("status")).toContainText("Connected");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).last()).toBeVisible();

  const response = await page.request.get("/api/v1/health");
  expect(response.ok()).toBe(true);

  const body = (await response.json()) as { status?: string };
  expect(body.status).toBe("ok");
});

test("switches language and remembers the choice", async ({ page }) => {
  await page.goto("/");

  const languageSwitcher = page
    .getByRole("combobox", { name: "Language" })
    .filter({ visible: true })
    .first();
  await languageSwitcher.selectOption("el");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ένας πιο ήρεμος");
  await expect(page.locator("html")).toHaveAttribute("lang", "el");

  await page.reload();

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ένας πιο ήρεμος");
});

test("does not overflow horizontally at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );

  expect(overflows).toBe(false);
});
