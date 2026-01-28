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

test("stun click adds defender pill", async ({ page }) => {
  await openAttackResolution(page, { weaponRules: [{ id: "stun" }] });

  const chip = page.locator(".wr-chip", { hasText: "Stun" });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect(page.getByTestId("effect-pill-stunned-defender")).toBeVisible();
});

test("hot click shows attacker pill and modal on apply", async ({ page }) => {
  await openAttackResolution(page, { weaponRules: [{ id: "hot" }] });

  const chip = page.locator(".wr-chip", { hasText: "Hot" });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect(page.getByTestId("effect-pill-hot-attacker")).toBeVisible();

  await page.getByRole("button", { name: "Apply Damage" }).click();
  await expect(page.getByRole("dialog", { name: "Hot Damage" })).toBeVisible();
});

test("shock click adds defender pill and note", async ({ page }) => {
  await openAttackResolution(page, { weaponRules: [{ id: "shock" }] });

  const chip = page.locator(".wr-chip", { hasText: "Shock" });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect(page.getByTestId("effect-pill-shock-defender")).toBeVisible();
  await expect(page.getByTestId("notes-defender")).toContainText(
    "Shock: In post-roll, discard 1 normal success; if none, discard 1 crit.",
  );
});

test("brutal auto note appears without clicking", async ({ page }) => {
  await openAttackResolution(page, { weaponRules: [{ id: "brutal" }] });

  await expect(page.getByTestId("notes-defender")).toContainText(
    "Brutal: you can only block with crits.",
  );
});

test("piercing crits disabled without crit", async ({ page }) => {
  await openAttackResolution(page, {
    weaponRules: [{ id: "piercing-crits", value: 2 }],
    combatCtxOverrides: { inputs: { attackCrits: 0 } },
  });

  const chip = page.locator(".wr-chip", { hasText: "Piercing Crits 2" });
  await expect(chip).toHaveAttribute("aria-disabled", "true");
});

test("piercing crits enabled with crit and adds pill", async ({ page }) => {
  await openAttackResolution(page, {
    weaponRules: [{ id: "piercing-crits", value: 2 }],
    combatCtxOverrides: { inputs: { attackCrits: 1 } },
  });

  const chip = page.locator(".wr-chip", { hasText: "Piercing Crits 2" });
  await expect(chip).toHaveAttribute("aria-disabled", "false");
  await chip.click();

  await expect(page.getByTestId("effect-pill-piercing-crits-defender")).toBeVisible();
});
