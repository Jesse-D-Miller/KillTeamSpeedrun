import { test, expect } from "@playwright/test";

async function seedFirefight(page) {
  await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    if (!state?.game?.length) return;
    const teamAUnit = state.game.find((unit) => unit.teamId === "alpha") || null;
    window.ktSetGameState?.({
      phase: "FIREFIGHT",
      topBar: { ...(state.topBar || {}), phase: "FIREFIGHT" },
      firefight: {
        ...(state.firefight || {}),
        activePlayerId: "A",
        activeOperativeId: teamAUnit?.id || null,
        orderChosenThisActivation: false,
        awaitingOrder: false,
        awaitingActions: false,
      },
      ui: { actionFlow: null },
    });
  });
}

async function resetE2EEvents(page) {
  await page.evaluate(() => {
    window.__ktE2E_gameEvents = [];
    window.__ktE2E_combatEvents = [];
  });
}

async function relayEvents(from, to) {
  const { gameEvents, combatEvents } = await from.evaluate(() => ({
    gameEvents: window.__ktE2E_gameEvents || [],
    combatEvents: window.__ktE2E_combatEvents || [],
  }));

  await to.evaluate(
    ({ gameEvents: nextGameEvents, combatEvents: nextCombatEvents }) => {
      nextGameEvents.forEach((event) => {
        window.ktDispatchGameEvent?.(event.type, event.payload);
      });
      nextCombatEvents.forEach((event) => {
        window.ktDispatchCombatEvent?.(event.type, event.payload);
      });
    },
    { gameEvents, combatEvents },
  );
}

async function openAttackResolutionForBoth(browser) {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");
  await pageB.goto("/jesse/army?e2e=1&slot=B&armyKey=kommandos");

  await seedFirefight(pageA);
  await seedFirefight(pageB);
  await resetE2EEvents(pageA);
  await resetE2EEvents(pageB);

  const firstCard = pageA
    .getByTestId("unit-grid")
    .locator("[data-testid^='unit-card-']")
    .first();
  await firstCard.click();

  await expect(pageA.getByTestId("unit-focused")).toBeVisible();
  await pageA.getByTestId("action-activate-engage").click();
  await pageA.getByTestId("action-shoot").click();

  await expect(pageA.getByTestId("target-select-screen")).toBeVisible();
  await expect(pageA.getByTestId("target-select-modal")).toBeVisible();

  const enemyTarget = pageA.locator("[data-testid^='target-beta:']").first();
  await expect(enemyTarget).toBeVisible();
  await enemyTarget.focus();
  await pageA.keyboard.press("Enter");

  const confirmBtn = pageA.getByTestId("target-confirm");
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  const modalA = pageA.getByTestId("attack-resolution-modal");
  await expect(modalA).toBeVisible();

  await relayEvents(pageA, pageB);

  const modalB = pageB.getByTestId("attack-resolution-modal");
  await expect(modalB).toBeVisible();

  const { attackerName, defenderName } = await pageA.evaluate(() => {
    const state = window.ktGetGameState?.();
    const attackerId =
      state?.combatState?.attackingOperativeId ||
      state?.ui?.actionFlow?.attackerId ||
      null;
    const defenderId =
      state?.combatState?.defendingOperativeId ||
      state?.ui?.actionFlow?.defenderId ||
      null;
    const attacker = state?.game?.find((unit) => unit.id === attackerId);
    const defender = state?.game?.find((unit) => unit.id === defenderId);
    return {
      attackerName: attacker?.name || "",
      defenderName: defender?.name || "",
    };
  });

  await expect(modalA.getByText(attackerName)).toBeVisible();
  await expect(modalA.getByText(defenderName)).toBeVisible();
  await expect(modalB.getByText(attackerName)).toBeVisible();
  await expect(modalB.getByText(defenderName)).toBeVisible();

  await contextA.close();
  await contextB.close();
}

test("opens for both players after target confirm", async ({ browser }) => {
  await openAttackResolutionForBoth(browser);
});
