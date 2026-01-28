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
  const { weaponRules, combatCtxOverrides } = options;

  // ✅ ONE shared context (two pages)
  const context = await browser.newContext();

  // ✅ Ensure globals exist before app loads
  await context.addInitScript(({ weaponRulesInit, combatOverridesInit }) => {
    if (weaponRulesInit != null) window.__ktE2E_weaponRules = weaponRulesInit;
    if (combatOverridesInit != null) window.__ktE2E_combatCtxOverrides = combatOverridesInit;
  }, { weaponRulesInit: weaponRules ?? null, combatOverridesInit: combatCtxOverrides ?? null });

  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.goto("/e2e/attack-resolution?role=attacker");
  await pageB.goto("/e2e/attack-resolution?role=defender");

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

  const instructionsA = pageA.getByTestId("roll-instructions");
  const instructionsB = pageB.getByTestId("roll-instructions");

  await expect(instructionsA).toBeVisible();
  await expect(instructionsB).toBeVisible();

  await expect(instructionsA).toContainText(`Roll ${expected.maxAttackDice}`);
  await expect(instructionsA).toContainText(`success on ${expected.attackerSuccessThreshold}+`);
  await expect(instructionsA).toContainText("crit on 6+");
  await expect(instructionsA).toContainText(`Roll ${expected.maxDefenseDice}`);
  await expect(instructionsA).toContainText(`success on ${expected.defenderSuccessThreshold}+`);

  await context.close();
});

test("weapon rule click shows tooltip", async ({ browser }) => {
  const { context, pageA } = await openAttackResolutionForBoth(browser, { weaponRules: ["silent"] });

  const silentChip = pageA.locator(".wr-chip", { hasText: "Silent" });
  await expect(silentChip).toBeVisible();
  await silentChip.click();

  const popover = pageA.getByTestId("weapon-rules-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Silent");
  await expect(popover).toContainText("You can Shoot while on Conceal.");

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

test("weapon rules popover shows label + boiled down text", async ({ browser }) => {
  const { context, pageA } = await openAttackResolutionForBoth(browser, {
    weaponRules: [{ id: "lethal", value: 5 }],
  });

  const lethalChip = pageA.locator(".wr-chip", { hasText: "Lethal 5+" });
  await lethalChip.click();

  const popover = pageA.getByTestId("weapon-rules-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Lethal 5+");
  await expect(popover).toContainText("Critical successes are 5+");

  await context.close();
});

test("weapon rules popover closes via close, outside, and escape", async ({ browser }) => {
  const { context, pageA } = await openAttackResolutionForBoth(browser, { weaponRules: ["balanced"] });

  const chip = pageA.locator(".wr-chip", { hasText: "Balanced" });

  await chip.click();
  await expect(pageA.getByTestId("weapon-rules-popover")).toBeVisible();

  // Close button
  await pageA.getByLabel(/close/i).click();
  await expect(pageA.getByTestId("weapon-rules-popover")).toBeHidden();

  // Outside click
  await chip.click();
  await expect(pageA.getByTestId("weapon-rules-popover")).toBeVisible();
  await pageA.locator(".attack-resolution__main").click({ position: { x: 10, y: 10 } });
  await expect(pageA.getByTestId("weapon-rules-popover")).toBeHidden();

  // Escape
  await chip.click();
  await expect(pageA.getByTestId("weapon-rules-popover")).toBeVisible();
  await pageA.keyboard.press("Escape");
  await expect(pageA.getByTestId("weapon-rules-popover")).toBeHidden();

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

test("weapon rules popover repositions on scroll", async ({ browser }) => {
  const { context, pageA } = await openAttackResolutionForBoth(browser, { weaponRules: ["balanced"] });

  await pageA.locator(".wr-chip", { hasText: "Balanced" }).click();
  const popover = pageA.getByTestId("weapon-rules-popover");
  await expect(popover).toBeVisible();

  const before = await popover.boundingBox();

  await pageA.evaluate(() => {
    const main = document.querySelector(".attack-resolution__main");
    if (!main) return;
    main.style.paddingBottom = "2000px";
    main.scrollTop = main.scrollTop + 200;
  });

  await pageA.waitForTimeout(50);
  const after = await popover.boundingBox();

  if (before && after) {
    await expect(after.y).not.toEqual(before.y);
  }

  await context.close();
});

test("disabled rule chips show explanation popover", async ({ browser }) => {
  const { context, pageA } = await openAttackResolutionForBoth(browser, {
    weaponRules: [{ id: "devastating", value: 3 }],
    combatCtxOverrides: { inputs: { attackLockedIn: false } },
  });

  const disabledChip = pageA.locator(".wr-chip", { hasText: "Devastating 3" });
  await expect(disabledChip).toBeVisible();
  await expectChipDisabled(disabledChip);

  // Even if "disabled", we want the click to show the "why" popover.
  await disabledChip.click({ force: true });

  const popover = pageA.getByTestId("weapon-rules-popover");
  await expect(popover).toBeVisible();
  await expect(popover).toContainText(/lock in attack first/i);

  await context.close();
});

test("clicking a second rule updates popover content", async ({ browser }) => {
  const { context, pageA } = await openAttackResolutionForBoth(browser, {
    weaponRules: [{ id: "lethal", value: 5 }, "balanced"],
  });

  const popover = pageA.getByTestId("weapon-rules-popover");

  await pageA.locator(".wr-chip", { hasText: "Balanced" }).click();
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("Balanced");

  await pageA.locator(".wr-chip", { hasText: "Lethal 5+" }).click();
  await expect(popover).toContainText("Lethal 5+");
  await expect(popover).toContainText("Critical successes are 5+");

  await context.close();
});

test("popover does not create extra modal overlays", async ({ browser }) => {
  const { context, pageA } = await openAttackResolutionForBoth(browser, { weaponRules: ["balanced"] });

  await pageA.locator(".wr-chip", { hasText: "Balanced" }).click();
  await expect(pageA.getByTestId("weapon-rules-popover")).toBeVisible();

  const modalCount = await pageA.locator(".kt-modal").count();
  await expect(modalCount).toBe(1);

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
