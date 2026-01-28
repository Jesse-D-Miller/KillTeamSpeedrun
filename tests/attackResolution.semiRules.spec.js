import { test, expect } from "@playwright/test";

async function openAttackResolution(page, { weaponRules, combatCtxOverrides } = {}) {
  if (weaponRules) {
    await page.addInitScript((rules) => {
      window.__ktE2E_weaponRules = rules;
    }, weaponRules);
  }

  if (combatCtxOverrides) {
    await page.addInitScript((overrides) => {
      window.__ktE2E_combatCtxOverrides = overrides;
    }, combatCtxOverrides);
  }

  await page.goto("/e2e/attack-resolution");
  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible();
}

test("stun click adds defender pill and keeps it after closing tooltip", async ({ page }) => {
  await openAttackResolution(page, { weaponRules: [{ id: "stun" }] });

  const chip = page.locator(".wr-chip", { hasText: "Stun" });
  await expect(chip).toBeVisible();
  await chip.click();

  const popover = page.getByTestId("weapon-rules-popover");
  await expect(popover).toContainText("Stun");
  await expect(popover).toContainText("apply Stun");

  const pill = page.getByTestId("effect-pill-stunned-defender");
  await expect(pill).toBeVisible();

  await page.getByLabel("Close").click();
  await expect(popover).toBeHidden();
  await expect(pill).toBeVisible();
});

test("piercing crits applies defender pill when attacker has a crit", async ({ page }) => {
  await openAttackResolution(page, {
    weaponRules: [{ id: "piercing-crits", value: 2 }],
    combatCtxOverrides: { inputs: { attackCrits: 1 } },
  });

  const chip = page.locator(".wr-chip", { hasText: "Piercing Crits 2" });
  await expect(chip).toBeVisible();
  await chip.click();

  const pill = page.getByTestId("effect-pill-piercing-crits-defender");
  await expect(pill).toBeVisible();
  await expect(pill).toContainText("PIERCING CRITS -2 DICE");
});

test("piercing crits is disabled without a crit", async ({ page }) => {
  await openAttackResolution(page, {
    weaponRules: [{ id: "piercing-crits", value: 2 }],
    combatCtxOverrides: { inputs: { attackCrits: 0 } },
  });

  const chip = page.locator(".wr-chip", { hasText: "Piercing Crits 2" });
  await expect(chip).toHaveAttribute("aria-disabled", "true");
  await chip.click({ force: true });
  const popover = page.getByTestId("weapon-rules-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Need at least one crit");
});

test("shock click adds defender pill and note", async ({ page }) => {
  await openAttackResolution(page, { weaponRules: [{ id: "shock" }] });

  const chip = page.locator(".wr-chip", { hasText: "Shock" });
  await expect(chip).toBeVisible();
  await chip.click();

  const pill = page.getByTestId("effect-pill-shock-defender");
  await expect(pill).toBeVisible();
  await expect(page.getByTestId("notes-defender")).toContainText(
    "Shock: In post-roll, discard 1 normal success; if none, discard 1 crit.",
  );
});

test("hot click shows modal on resolve and logs resolution", async ({ page }) => {
  await openAttackResolution(page, { weaponRules: [{ id: "hot" }] });

  const chip = page.locator(".wr-chip", { hasText: "Hot" });
  await expect(chip).toBeVisible();
  await chip.click();

  const pill = page.getByTestId("effect-pill-hot-attacker");
  await expect(pill).toBeVisible();

  await page.getByRole("button", { name: "Apply Damage" }).click();

  const hotModal = page.getByRole("dialog", { name: "Hot Damage" });
  await expect(hotModal).toBeVisible();

  await hotModal.locator("input[type='number']").fill("2");
  await hotModal.getByRole("button", { name: "Apply Hot Damage" }).click();

  await expect(page.getByText("Hot resolved for 2 damage.")).toBeVisible();
});
