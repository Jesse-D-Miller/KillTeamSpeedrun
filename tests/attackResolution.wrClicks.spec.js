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
  await openAttackResolution(page, {
    weaponRules: [{ id: "stun" }],
    combatCtxOverrides: {
      attackDice: [{ value: 6, tags: ["retained", "crit"] }],
      inputs: { attackCrits: 1 },
    },
  });

  const chip = page.locator(".wr-chip", { hasText: "Stun" });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-disabled", "false");
  await chip.click();

  await expect(page.getByTestId("effect-pill-stunned-defender")).toBeVisible();
});

test("stun click updates defender card APL", async ({ page }) => {
  await openAttackResolution(page, {
    weaponRules: [{ id: "stun" }],
    combatCtxOverrides: {
      attackDice: [{ value: 6, tags: ["retained", "crit"] }],
      inputs: { attackCrits: 1 },
    },
  });

  const chip = page.locator(".wr-chip", { hasText: "Stun" });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-disabled", "false");
  await chip.click();

  const defenderPanel = page.getByTestId("defender-pre-roll");
  await expect(defenderPanel.getByTestId("effect-pill-stunned-defender")).toBeVisible();
  await expect(defenderPanel.getByTestId("status-pill-stunned")).toBeVisible();
  await expect(defenderPanel.getByTestId("unit-apl-current")).toHaveText("2/3");
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

test("shock click adds defender pill", async ({ page }) => {
  await openAttackResolution(page, { weaponRules: [{ id: "shock" }] });

  const chip = page.locator(".wr-chip", { hasText: "Shock" });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect(page.getByTestId("effect-pill-shock-defender")).toBeVisible();
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
