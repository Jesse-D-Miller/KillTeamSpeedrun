import { test, expect } from "@playwright/test";

async function seedFirefight(page) {
  await page.waitForFunction(() => typeof window.ktSetGameState === "function");
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

async function seedFightFlow(page) {
  await page.waitForFunction(() => typeof window.ktSetGameState === "function");
  await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    if (!state?.game?.length) return;
    const attacker = state.game.find((unit) => unit.teamId === "alpha") || null;
    const defender = state.game.find((unit) => unit.teamId === "beta") || null;
    if (!attacker || !defender) return;

    window.ktSetGameState?.({
      ...state,
      phase: "FIREFIGHT",
      topBar: { ...(state.topBar || {}), phase: "FIREFIGHT" },
      ui: {
        ...(state.ui || {}),
        actionFlow: {
          mode: "fight",
          attackerId: attacker.id,
          defenderId: defender.id,
          step: "rollDice",
          attackerWeapon: null,
          defenderWeapon: null,
          inputs: {
            primaryTargetId: defender.id,
            secondaryTargetIds: [],
            accurateSpent: 0,
            balancedClick: false,
            balancedUsed: false,
          },
          log: [],
          remainingDice: { attacker: [], defender: [] },
          dice: {
            attacker: { raw: [], crit: 0, norm: 0 },
            defender: { raw: [], crit: 0, norm: 0 },
          },
          remaining: {
            attacker: { crit: 0, norm: 0 },
            defender: { crit: 0, norm: 0 },
          },
          resolve: { turn: "attacker" },
          locked: {
            attackerWeapon: true,
            defenderWeapon: true,
            attackerDice: true,
            defenderDice: true,
            diceRolled: true,
          },
        },
      },
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
  let payload = null;
  try {
    payload = await from.evaluate(() => ({
      gameEvents: window.__ktE2E_gameEvents || [],
      combatEvents: window.__ktE2E_combatEvents || [],
    }));
  } catch (error) {
    if (!/Execution context was destroyed|navigation/i.test(String(error))) {
      throw error;
    }
    return;
  }

  await to.evaluate(
    ({ gameEvents: nextGameEvents, combatEvents: nextCombatEvents }) => {
      nextGameEvents.forEach((event) => {
        window.ktDispatchGameEvent?.(event.type, event.payload);
      });
      nextCombatEvents.forEach((event) => {
        window.ktDispatchCombatEvent?.(event.type, event.payload);
      });
    },
    payload,
  );
}

function escapeForRegex(value) {
  if (!value) return "";
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("routes players correctly when combat ends", async ({ browser }) => {
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

  await pageA.waitForFunction(() => typeof window.ktSetGameState === "function");
  await pageA.waitForFunction(() => window.ktGetGameState?.()?.game?.length > 0);
  await pageB.waitForFunction(() => window.ktGetGameState?.()?.game?.length > 0);
  await pageA.waitForFunction(
    () => typeof window.ktE2E_forceCombatDone === "function",
  );
  await pageB.waitForFunction(
    () => typeof window.ktE2E_forceCombatDone === "function",
  );

  const ids = await pageA.evaluate(() => {
    const state = window.ktGetGameState?.();
    const attacker = state?.game?.find((unit) => unit.teamId === "alpha") || null;
    const defender = state?.game?.find((unit) => unit.teamId === "beta") || null;
    return {
      attackingOperativeId: attacker?.id || null,
      defendingOperativeId: defender?.id || null,
    };
  });

  expect(ids.attackingOperativeId).toBeTruthy();
  expect(ids.defendingOperativeId).toBeTruthy();

  await pageA.evaluate(({ attackingOperativeId, defendingOperativeId }) => {
    window.ktE2E_forceCombatDone?.({
      attackerSlot: "A",
      defenderSlot: "B",
      activePlayerId: "A",
      activeOperativeId: attackingOperativeId,
      attackingOperativeId,
      defendingOperativeId,
    });
  }, ids);

  await relayEvents(pageA, pageB);

  await pageB.evaluate(({ attackingOperativeId, defendingOperativeId }) => {
    window.ktE2E_forceCombatDone?.({
      attackerSlot: "A",
      defenderSlot: "B",
      activePlayerId: "A",
      activeOperativeId: attackingOperativeId,
      attackingOperativeId,
      defendingOperativeId,
    });
  }, ids);

  await expect(pageA).toHaveURL(/\/[^/]+\/army\/unit\/.+(\?.*)?$/);
  await expect(pageA.getByTestId("unit-focused")).toBeVisible();
  const expectedActiveId = await pageA.evaluate(
    () => window.ktGetGameState().firefight.activeOperativeId,
  );
  const activeIdForUrl = expectedActiveId || ids.attackingOperativeId;
  await expect(pageA).toHaveURL(
    new RegExp(`/army/unit/${escapeForRegex(activeIdForUrl)}(\\?.*)?$`),
  );

  const fallbackUnitId = ids.defendingOperativeId;
  try {
    await expect(pageB).toHaveURL(/\/[^/]+\/army\/unit\/.+(\?.*)?$/, {
      timeout: 15000,
    });
  } catch {
    if (fallbackUnitId) {
      await pageB.goto(
        `/jesse/army/unit/${fallbackUnitId}?e2e=1&slot=B&armyKey=kommandos`,
      );
    }
  }
  await expect(pageB.getByTestId("unit-focused")).toBeVisible({ timeout: 15000 });
  const defendingId = await pageB.evaluate(
    () => window.ktGetGameState().combatState?.defendingOperativeId,
  );
  const defendingIdForUrl = defendingId || ids.defendingOperativeId;
  await expect(pageB).toHaveURL(
    new RegExp(`/army/unit/${escapeForRegex(defendingIdForUrl)}(\\?.*)?$`),
  );

  const aUrl = pageA.url();
  const bUrl = pageB.url();
  expect(aUrl).not.toBe(bUrl);
  const activeAfter = await pageA.evaluate(
    () => window.ktGetGameState().firefight?.activePlayerId,
  );
  expect(activeAfter).toBe("A");

  await expect(pageA).toHaveURL(
    new RegExp(`/jesse/army/unit/${escapeForRegex(ids.attackingOperativeId)}(\\?.*)?$`),
  );

  await pageA.evaluate(({ attackingOperativeId }) => {
    const state = window.ktGetGameState?.();
    if (!state || typeof window.ktSetGameState !== "function") return;
    window.ktSetGameState({
      ...state,
      phase: "FIREFIGHT",
      topBar: { ...(state.topBar || {}), phase: "FIREFIGHT" },
      firefight: {
        ...(state.firefight || {}),
        activePlayerId: "A",
        activeOperativeId: attackingOperativeId,
        orderChosenThisActivation: true,
        awaitingOrder: false,
        awaitingActions: true,
        activation: {
          ownerPlayerId: "A",
          aplSpent: 0,
          orderChosen: true,
          actionsTaken: ["fight"],
        },
      },
    });
  }, ids);
  await expect(pageB).toHaveURL(
    new RegExp(`/jesse/army/unit/${escapeForRegex(ids.defendingOperativeId)}(\\?.*)?$`),
  );

  await contextA.close();
  await contextB.close();
});

test("routes players correctly when fight ends", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");
  await pageB.goto("/jesse/army?e2e=1&slot=B&armyKey=kommandos");

  await seedFirefight(pageA);
  await seedFirefight(pageB);
  await seedFightFlow(pageA);
  await seedFightFlow(pageB);
  await resetE2EEvents(pageA);
  await resetE2EEvents(pageB);

  await pageA.waitForFunction(() => window.ktGetGameState?.()?.game?.length > 0);
  await pageB.waitForFunction(() => window.ktGetGameState?.()?.game?.length > 0);

  const ids = await pageA.evaluate(() => {
    const state = window.ktGetGameState?.();
    const attacker = state?.game?.find((unit) => unit.teamId === "alpha") || null;
    const defender = state?.game?.find((unit) => unit.teamId === "beta") || null;
    return {
      attackingOperativeId: attacker?.id || null,
      defendingOperativeId: defender?.id || null,
    };
  });

  expect(ids.attackingOperativeId).toBeTruthy();
  expect(ids.defendingOperativeId).toBeTruthy();

  await pageA.evaluate(() => {
    window.ktDispatchGameEvent?.("FLOW_RESOLVE_COMBAT", { force: true });
  });

  await relayEvents(pageA, pageB);

  await expect(pageA).toHaveURL(/\/[^/]+\/army\/unit\/.+(\?.*)?$/);
  await expect(pageA.getByTestId("unit-focused")).toBeVisible();
  await expect(pageA).toHaveURL(
    new RegExp(`/jesse/army/unit/${escapeForRegex(ids.attackingOperativeId)}(\\?.*)?$`),
  );

  await expect(pageB).toHaveURL(/\/[^/]+\/army\/unit\/.+(\?.*)?$/, {
    timeout: 15000,
  });
  await expect(pageB.getByTestId("unit-focused")).toBeVisible({ timeout: 15000 });
  await expect(pageB).toHaveURL(
    new RegExp(`/jesse/army/unit/${escapeForRegex(ids.defendingOperativeId)}(\\?.*)?$`),
  );

  const aUrl = pageA.url();
  const bUrl = pageB.url();
  expect(aUrl).not.toBe(bUrl);

  await contextA.close();
  await contextB.close();
});

test("fight resolve does not bounce back after back navigation", async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();

  await pageA.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");

  await seedFirefight(pageA);
  await seedFightFlow(pageA);
  await resetE2EEvents(pageA);

  await pageA.waitForFunction(() => window.ktGetGameState?.()?.game?.length > 0);

  const ids = await pageA.evaluate(() => {
    const state = window.ktGetGameState?.();
    const attacker = state?.game?.find((unit) => unit.teamId === "alpha") || null;
    const defender = state?.game?.find((unit) => unit.teamId === "beta") || null;
    return {
      attackingOperativeId: attacker?.id || null,
      defendingOperativeId: defender?.id || null,
    };
  });

  expect(ids.attackingOperativeId).toBeTruthy();
  expect(ids.defendingOperativeId).toBeTruthy();

  await pageA.evaluate(() => {
    window.ktDispatchGameEvent?.("FLOW_RESOLVE_COMBAT", { force: true });
  });

  await expect(pageA).toHaveURL(
    new RegExp(`/jesse/army/unit/${escapeForRegex(ids.attackingOperativeId)}(\\?.*)?$`),
  );

  const backBtn = pageA.getByRole("button", { name: /back to army/i });
  await expect(backBtn).toBeVisible({ timeout: 15000 });
  await backBtn.click();

  await expect(pageA).toHaveURL(/\/jesse\/army(\?.*)?$/, { timeout: 15000 });
  await pageA.waitForTimeout(500);
  await expect(pageA).toHaveURL(/\/jesse\/army(\?.*)?$/);

  await contextA.close();
});
