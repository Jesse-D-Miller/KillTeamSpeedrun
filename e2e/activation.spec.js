import { test, expect } from "@playwright/test";

test("click unit card in grid -> navigates to unit focused screen", async ({ page }) => {
  await page.goto("/jesse/army?e2e=1&slot=A");

  await expect(page.getByTestId("topbar")).toBeVisible();
  await expect(page.getByTestId("unit-grid")).toBeVisible();

  // Click first unit card in the grid
  const firstCard = page
    .getByTestId("unit-grid")
    .locator("[data-testid^='unit-card-']")
    .first();
  await firstCard.click();

  // Now we should be on the focused unit route/screen
  await expect(page.getByTestId("unit-focused")).toBeVisible();
  await expect(page.getByTestId("actions-panel")).toBeVisible();
});
