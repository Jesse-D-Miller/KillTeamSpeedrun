import { test, expect } from "@playwright/test";
import { lastCombatEvent } from "./helpers";

async function goToShootTargetSelect(page) {
  await page.goto("/jesse/army?e2e=1&slot=A");

  const firstCard = page
    .getByTestId("unit-grid")
    .locator("[data-testid^='unit-card-']")
    .first();
  await firstCard.click();

  await expect(page.getByTestId("unit-focused")).toBeVisible();
  await page.getByTestId("action-activate-engage").click();
  await expect(page.getByTestId("actions-panel")).toBeVisible();

  await page.getByTestId("action-shoot").click();
  await expect(page).toHaveURL(/\/jesse\/target-select/);
  await expect(page.getByTestId("target-select-modal")).toBeVisible();
}

test("shoot target confirm opens attack resolution", async ({ page }) => {
  await goToShootTargetSelect(page);

  const firstTarget = page.locator("[data-testid^='target-beta:']").first();
  await expect(firstTarget).toBeVisible();
  await firstTarget.press("Enter");
  await page.getByTestId("target-confirm").click();

  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible();
  await expect(page.getByTestId("weapon-select-modal")).toHaveCount(0);

  const combatEv = await lastCombatEvent(page);
  expect(combatEv?.type).toBe("START_RANGED_ATTACK");
});
