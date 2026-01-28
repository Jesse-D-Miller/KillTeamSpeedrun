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

test("brutal shows defender auto note and applied chip", async ({ page }) => {
  await openAttackResolution(page, { weaponRules: [{ id: "brutal" }] });

  const chip = page.locator(".wr-chip", { hasText: "Brutal" });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveClass(/wr-chip--auto/);
  await expect(chip).toHaveClass(/is-applied/);

  const defenderNotes = page.getByTestId("notes-defender");
  await expect(defenderNotes).toContainText("only block with crits");
});

test("cover/obscured/vantage toggles update notes", async ({ page }) => {
  await openAttackResolution(page);

  const defenderNotes = page.getByTestId("notes-defender");
  const attackerNotes = page.getByTestId("notes-attacker");

  const cover = page.getByLabel("Cover");
  await cover.check();
  await expect(defenderNotes).toContainText("Cover save available");
  await cover.uncheck();
  await expect(defenderNotes).not.toContainText("Cover save available");

  const obscured = page.getByLabel("Obscured");
  await obscured.check();
  await expect(attackerNotes).toContainText("Obscured affects hit retention");
  await obscured.uncheck();
  await expect(attackerNotes).not.toContainText("Obscured affects hit retention");

  const vantage = page.getByLabel("Vantage");
  await vantage.check();
  await expect(attackerNotes).toContainText("Vantage may deny cover retains");
  await vantage.uncheck();
  await expect(attackerNotes).not.toContainText("Vantage may deny cover retains");
});
