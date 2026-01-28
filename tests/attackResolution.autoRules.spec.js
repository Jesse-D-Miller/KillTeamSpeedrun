import { test, expect } from "@playwright/test";

async function openAttackResolution(page, { weaponRules } = {}) {
  if (weaponRules) {
    await page.addInitScript((rules) => {
      window.__ktE2E_weaponRules = rules;
    }, weaponRules);
  }

  await page.goto("/e2e/attack-resolution");
  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible();
}

test("brutal shows applied chip", async ({ page }) => {
  await openAttackResolution(page, { weaponRules: [{ id: "brutal" }] });

  const chip = page.locator(".wr-chip", { hasText: "Brutal" });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveClass(/wr-chip--auto/);
  await expect(chip).toHaveClass(/is-applied/);

});

test("vantage shows chooser and applies Accurate", async ({ page }) => {
  await openAttackResolution(page);

  const vantage = page.getByTestId("condition-vantage");
  await expect(vantage).toBeVisible();
  await vantage.click();

  const option4 = page.getByTestId("vantage-choose-4");
  await expect(option4).toBeVisible();
  await option4.click();

  await expect(page.locator(".wr-chip", { hasText: "Accurate 2" })).toBeVisible();
});
