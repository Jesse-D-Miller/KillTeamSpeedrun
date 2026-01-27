import { test, expect } from "@playwright/test";

test("shoot -> goes to target select screen", async ({ page }) => {
  await page.goto("/jesse/army?e2e=1&slot=A");

  await page
    .getByTestId("unit-grid")
    .locator("[data-testid^='unit-card-']")
    .first()
    .click();
  await page.getByTestId("action-activate-engage").click();

  await expect(page.getByTestId("action-shoot")).toBeVisible();
  await page.getByTestId("action-shoot").click();

  await expect(page.getByTestId("target-select-screen")).toBeVisible();
});
