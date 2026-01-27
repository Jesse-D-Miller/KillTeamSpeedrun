import { test, expect } from "@playwright/test";

test("activate unit with Engage order shows actions", async ({ page }) => {
  await page.goto("/jesse/army?e2e=1&slot=A");

  const firstCard = page
    .getByTestId("unit-grid")
    .locator("[data-testid^='unit-card-']")
    .first();
  await firstCard.click();

  await expect(page.getByTestId("unit-focused")).toBeVisible();

  await expect(page.getByTestId("action-activate-engage")).toBeVisible();
  await page.getByTestId("action-activate-engage").click();

  // After activation, actions should appear
  await expect(page.getByTestId("actions-panel")).toBeVisible();
  await expect(page.getByTestId("action-end-activation")).toBeVisible();
});
