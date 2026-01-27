import { test, expect } from "@playwright/test";

async function seedFirefight(page, { cpA = 1, cpB = 0 } = {}) {
  await page.waitForFunction(() => typeof window.ktSetGameState === "function");
  await page.evaluate(
    ({ nextCpA, nextCpB }) => {
      const state = window.ktGetGameState?.();
      if (!state?.game?.length) return;
      const teamAUnit = state.game.find((unit) => unit.teamId === "alpha") || null;
      window.ktSetGameState?.({
        phase: "FIREFIGHT",
        topBar: { ...(state.topBar || {}), phase: "FIREFIGHT" },
        cp: { A: nextCpA, B: nextCpB },
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
    },
    { nextCpA: cpA, nextCpB: cpB },
  );
  await page.waitForFunction(
    ({ nextCpA, nextCpB }) => {
      const state = window.ktGetGameState?.();
      return state?.cp?.A === nextCpA && state?.cp?.B === nextCpB;
    },
    { nextCpA: cpA, nextCpB: cpB },
  );
}

async function resetE2EEvents(page) {
  await page.evaluate(() => {
    window.__ktE2E_gameEvents = [];
    window.__ktE2E_combatEvents = [];
  });
}

async function relayEvents(from, to) {
  const { gameEvents } = await from.evaluate(() => ({
    gameEvents: window.__ktE2E_gameEvents || [],
  }));

  await to.evaluate(({ gameEvents: nextGameEvents }) => {
    nextGameEvents.forEach((event) => {
      window.ktDispatchGameEvent?.(event.type, event.payload);
    });
  }, { gameEvents });
}

test("cannot use ploy when CP would go below zero", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");
  await pageB.goto("/jesse/army?e2e=1&slot=B&armyKey=kommandos");

  await seedFirefight(pageA, { cpA: 1, cpB: 0 });
  await seedFirefight(pageB, { cpA: 1, cpB: 0 });
  await resetE2EEvents(pageA);
  await resetE2EEvents(pageB);

  await pageA
    .getByTestId("unit-grid")
    .locator("[data-testid^='unit-card-']")
    .first()
    .click();

  await expect(pageA.getByText("Firefight ploys")).toBeVisible();
  const startingCp = Number(
    (await pageA.getByTestId("cp-value").textContent()) || "0",
  );
  expect(startingCp).toBeGreaterThanOrEqual(1);

  const ployButton = pageA.locator("[data-ploy-cost='1']").first();
  await expect(ployButton).toBeVisible();
  for (let i = 0; i < startingCp; i += 1) {
    await ployButton.click();
  }

  await expect(pageA.getByTestId("cp-value")).toHaveText("0");
  const stateAfterUse = await pageA.evaluate(() => window.ktGetGameState?.());
  expect(stateAfterUse?.cp?.A).toBe(0);

  await expect(ployButton).toBeDisabled();

  const events = await pageA.evaluate(() => window.__ktE2E_gameEvents || []);
  const uses = events.filter((event) => event.type === "USE_FIREFIGHT_PLOY");
  expect(uses.length).toBe(startingCp);

  await relayEvents(pageA, pageB);
  await expect(pageB.getByTestId("cp-value")).toHaveText("0");

  await contextA.close();
  await contextB.close();
});
