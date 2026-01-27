import { test, expect } from "@playwright/test";

test("clicking a unit card navigates to focused unit screen", async ({ page }) => {
  await page.goto("/jesse/army?e2e=1&slot=A");

  const firstCard = page
    .getByTestId("unit-grid")
    .locator("[data-testid^='unit-card-']")
    .first();

  await firstCard.click();

  await expect(page.getByTestId("unit-focused")).toBeVisible();
  await expect(page.getByTestId("actions-panel")).toBeVisible();
});
