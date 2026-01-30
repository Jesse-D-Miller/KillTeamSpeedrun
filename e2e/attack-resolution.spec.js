import { test, expect } from "@playwright/test";

/**
 * FIXES INCLUDED
 * 1) Uses ONE shared browser context (two pages) so localStorage/cookies/BroadcastChannel can sync.
 * 2) Uses context.addInitScript so __ktE2E_* globals exist BEFORE the app boots.
 * 3) Avoids networkidle flake; waits on concrete UI signals instead.
 * 4) Makes “disabled chip” assertions resilient (supports either disabled attr OR aria-disabled OR is-disabled class).
 * 5) Relay waits a tick after dispatching events (helps React settle).
 */

async function openAttackResolutionForBoth(browser, options = {}) {
  const { weaponRules, combatCtxOverrides, mode } = options;

  // ✅ ONE shared context (two pages)
  const context = await browser.newContext();

  // ✅ Ensure globals exist before app loads
  await context.addInitScript(({ weaponRulesInit, combatOverridesInit }) => {
    if (weaponRulesInit != null) window.__ktE2E_weaponRules = weaponRulesInit;
    if (combatOverridesInit != null) window.__ktE2E_combatCtxOverrides = combatOverridesInit;
  }, { weaponRulesInit: weaponRules ?? null, combatOverridesInit: combatCtxOverrides ?? null });

  const pageA = await context.newPage();
  const pageB = await context.newPage();

  const modeParam = mode ? `&mode=${encodeURIComponent(mode)}` : "";
  await pageA.goto(`/e2e/attack-resolution?role=attacker${modeParam}`);
  await pageB.goto(`/e2e/attack-resolution?role=defender${modeParam}`);

  await expect(pageA.getByTestId("attack-resolution-modal")).toBeVisible({ timeout: 15000 });
  await expect(pageB.getByTestId("attack-resolution-modal")).toBeVisible({ timeout: 15000 });

  return { context, pageA, pageB };
}

// Small helper for “chip disabled” across different implementations
async function expectChipDisabled(locator) {
  // prefer real disabled
  const disabledAttr = await locator.getAttribute("disabled");
  const ariaDisabled = await locator.getAttribute("aria-disabled");
  const className = (await locator.getAttribute("class")) || "";

  const isDisabled =
    disabledAttr != null ||
    ariaDisabled === "true" ||
    /\bis-disabled\b/.test(className);

  expect(isDisabled).toBeTruthy();
}

test("roll instructions render", async ({ browser }) => {
  const { context, pageA, pageB } = await openAttackResolutionForBoth(browser);
  const expected = {
    maxAttackDice: 4,
    attackerSuccessThreshold: 4,
    maxDefenseDice: 3,
    defenderSuccessThreshold: 4,
  };

  const attackerInstructionsA = pageA.getByTestId("roll-instructions");
  const defenderInstructionsA = pageA.getByTestId("roll-instructions-defender");
  const attackerInstructionsB = pageB.getByTestId("roll-instructions");
  const defenderInstructionsB = pageB.getByTestId("roll-instructions-defender");

  await expect(attackerInstructionsA).toBeVisible();
  await expect(defenderInstructionsA).toBeVisible();
  await expect(attackerInstructionsB).toBeVisible();
  await expect(defenderInstructionsB).toBeVisible();

  await expect(attackerInstructionsA).toContainText(`Roll ${expected.maxAttackDice}`);
  await expect(attackerInstructionsA).toContainText(
    `success on ${expected.attackerSuccessThreshold}+`,
  );
  await expect(attackerInstructionsA).toContainText("crit on 6+");

  await expect(defenderInstructionsA).toContainText(`Roll ${expected.maxDefenseDice}`);
  await expect(defenderInstructionsA).toContainText(
    `success on ${expected.defenderSuccessThreshold}+`,
  );
  await expect(defenderInstructionsA).toContainText("crit on 6+");

  await context.close();
});


test("weapon rules popover uses deterministic rules list", async ({ browser }) => {
  const { context, pageA } = await openAttackResolutionForBoth(browser, {
    weaponRules: [{ id: "lethal", value: 5 }, { id: "devastating", value: 3 }, "balanced"],
    combatCtxOverrides: { inputs: { attackLockedIn: false } },
  });

  await expect(pageA.getByTestId("weapon-rules-panel").first()).toBeVisible();
  await expect(pageA.locator(".wr-chip", { hasText: "Lethal 5+" })).toBeVisible();
  await expect(pageA.locator(".wr-chip", { hasText: "Devastating 3" })).toBeVisible();
  await expect(pageA.locator(".wr-chip", { hasText: "Balanced" })).toBeVisible();

  await context.close();
});


test("saturate disables defender cover save", async ({ browser }) => {
  const { context, pageA, pageB } = await openAttackResolutionForBoth(browser, {
    weaponRules: ["saturate"],
  });

  const saturateChip = pageA.locator(".wr-chip", { hasText: "Saturate" });
  await expect(saturateChip).toBeVisible();
  await saturateChip.click();

  const coverButton = pageB.getByTestId("condition-cover");
  await expectChipDisabled(coverButton);

  await context.close();
});

test("saturate auto-disables defender cover save", async ({ browser }) => {
  const { context, pageB } = await openAttackResolutionForBoth(browser, {
    weaponRules: ["saturate"],
  });

  await pageB.waitForFunction(() => {
    const btn = document.querySelector('[data-testid="condition-cover"]');
    if (!btn) return false;
    const ariaDisabled = btn.getAttribute("aria-disabled") === "true";
    const isDisabled = btn.hasAttribute("disabled") || ariaDisabled || btn.classList.contains("is-disabled");
    return isDisabled;
  });

  await expectChipDisabled(pageB.getByTestId("condition-cover"));

  await context.close();
});


test("final entry applies damage + closes modal", async ({ browser }) => {
  const { context, pageA, pageB } = await openAttackResolutionForBoth(browser);

  await pageA.getByTestId("final-hits").fill("1");
  await pageA.getByTestId("final-crits").fill("0");

  await pageA.getByRole("button", { name: /apply damage/i }).click();

  await expect(pageA.getByTestId("attack-resolution-modal")).toBeHidden({ timeout: 15000 });
  await expect(pageB.getByTestId("attack-resolution-modal")).toBeHidden({ timeout: 15000 });

  await context.close();
});

test("attack resolution resolves with zero damage when final hits and crits are zero", async ({ browser }) => {
  const { context, pageA, pageB } = await openAttackResolutionForBoth(browser);

  await expect(pageA.getByTestId("attack-resolution-modal")).toBeVisible();
  await expect(pageB.getByTestId("attack-resolution-modal")).toBeVisible();

  await pageA.getByTestId("final-hits").fill("0");
  await pageA.getByTestId("final-crits").fill("0");

  await expect(pageA.locator("text=Total Damage:")).toContainText("0");

  await pageA.getByRole("button", { name: "Apply Damage" }).click();

  await expect(pageA.getByTestId("attack-resolution-modal")).toBeHidden({ timeout: 15000 });
  await expect(pageB.getByTestId("attack-resolution-modal")).toBeHidden({ timeout: 15000 });

  await context.close();
});

test("fight apply damage closes modal", async ({ browser }) => {
  const { context, pageA, pageB } = await openAttackResolutionForBoth(browser, {
    mode: "fight",
  });

  await expect(pageA.getByTestId("attack-resolution-modal")).toBeVisible();
  await expect(pageB.getByTestId("attack-resolution-modal")).toBeVisible();

  await pageA.getByTestId("final-hits").fill("1");
  await pageA.getByTestId("final-crits").fill("0");
  await pageA.getByTestId("final-defense-hits").fill("1");
  await pageA.getByTestId("final-defense-crits").fill("0");

  await pageA.getByRole("button", { name: /apply damage/i }).click();

  await expect(pageA.getByTestId("attack-resolution-modal")).toBeHidden({ timeout: 15000 });
  await expect(pageB.getByTestId("attack-resolution-modal")).toBeHidden({ timeout: 15000 });

  await context.close();
});
