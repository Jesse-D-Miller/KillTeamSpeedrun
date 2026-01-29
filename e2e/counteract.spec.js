import { test, expect } from "@playwright/test";
import { lastGameEvent } from "./helpers";

async function seedCounteractWindow(page, { markOneCounteracted = false } = {}) {
  await page.waitForFunction(() => typeof window.ktSetGameState === "function");
  await page.waitForFunction(() => window.ktGetGameState?.()?.game?.length > 0);
  return await page.evaluate(({ markOneCounteracted }) => {
    const state = window.ktGetGameState?.();
    if (!state?.game?.length) return null;

    const teamAUnits = state.game.filter(
      (unit) => unit.owner === "A" || unit.teamId === "alpha",
    );
    const teamBUnits = state.game.filter(
      (unit) => unit.owner === "B" || unit.teamId === "beta",
    );

    if (!teamAUnits.length || !teamBUnits.length) return null;

    const eligibleUnit = teamAUnits[0];
    const counteractedUnit = teamAUnits[1] || teamAUnits[0];
    const readyOpponent = teamBUnits[0];

    const nextGame = state.game.map((unit) => {
      const isA = unit.owner === "A" || unit.teamId === "alpha";
      const isB = unit.owner === "B" || unit.teamId === "beta";
      if (isA) {
        const shouldMarkCounteracted =
          markOneCounteracted && unit.id === counteractedUnit.id;
        return {
          ...unit,
          owner: "A",
          teamId: unit.teamId ?? "alpha",
          weapons:
            unit.id === eligibleUnit.id
              ? [
                  { name: "Test Rifle", mode: "ranged", hit: 4, atk: 4, dmg: "3/4", wr: [] },
                  { name: "Test Blade", mode: "melee", hit: 4, atk: 4, dmg: "3/4", wr: [] },
                ]
              : unit.weapons,
          state: {
            ...(unit.state || {}),
            readyState: "EXPENDED",
            order: "engage",
            hasCounteractedThisTP: shouldMarkCounteracted ? true : false,
            apCurrent: Number(unit.stats?.apl ?? 2),
            woundsCurrent: Math.max(1, Number(unit.state?.woundsCurrent ?? unit.stats?.woundsMax ?? 1)),
          },
        };
      }
      if (isB) {
        return {
          ...unit,
          owner: "B",
          teamId: unit.teamId ?? "beta",
          state: {
            ...(unit.state || {}),
            readyState: unit.id === readyOpponent.id ? "READY" : "EXPENDED",
            order: unit.state?.order ?? "engage",
            apCurrent: Number(unit.stats?.apl ?? 2),
            woundsCurrent: Math.max(1, Number(unit.state?.woundsCurrent ?? unit.stats?.woundsMax ?? 1)),
          },
        };
      }
      return unit;
    });

    window.ktSetGameState?.({
      ...state,
      phase: "FIREFIGHT",
      turningPoint: Number(state.turningPoint ?? 1) || 1,
      topBar: {
        ...(state.topBar || {}),
        phase: "FIREFIGHT",
      },
      firefight: {
        ...(state.firefight || {}),
        activePlayerId: "A",
        activeOperativeId: null,
        orderChosenThisActivation: false,
        awaitingOrder: false,
        awaitingActions: false,
        activation: null,
      },
      ui: {
        ...(state.ui || {}),
        actionFlow: null,
      },
      game: nextGame,
    });

    return {
      eligibleUnitId: eligibleUnit.id,
      eligibleUnitName: eligibleUnit.name,
      counteractedUnitName: counteractedUnit.name,
      eligibleUnitAp: Number(eligibleUnit.stats?.apl ?? 2),
    };
  }, { markOneCounteracted });
}

async function waitForCounteractWindow(page) {
  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    if (!state) return false;
    return (
      state.phase === "FIREFIGHT" &&
      state.firefight?.activePlayerId === "A" &&
      !state.firefight?.activeOperativeId
    );
  });
}

test("counteract option appears when no ready operatives and opponent is ready", async ({ page }) => {
  await page.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");

  const seeded = await seedCounteractWindow(page);
  expect(seeded?.eligibleUnitId).toBeTruthy();

  await page.getByTestId(`unit-card-${seeded.eligibleUnitId}`).click();
  await expect(page.getByTestId("unit-focused")).toBeVisible();

  const focusedSeed = await seedCounteractWindow(page);
  expect(focusedSeed?.eligibleUnitId).toBeTruthy();
  await waitForCounteractWindow(page);

  const actionPanel = page.getByTestId("actions-panel");
  await expect(actionPanel).toBeVisible();

  await expect(page.getByTestId("action-counteract")).toBeVisible();
  await expect(page.getByTestId("action-counteract")).toBeEnabled();

  const unitCard = page.getByTestId(`unit-card-${seeded.eligibleUnitId}`);
  await expect(unitCard.locator(".pill--orange")).toBeVisible();

  await expect(page.getByTestId("action-reposition")).toHaveCount(0);
});

test("counteract activation allows 1 APL actions and keeps APL", async ({ page }) => {
  await page.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");

  const seeded = await seedCounteractWindow(page);
  expect(seeded?.eligibleUnitId).toBeTruthy();

  await page.getByTestId(`unit-card-${seeded.eligibleUnitId}`).click();
  await expect(page.getByTestId("unit-focused")).toBeVisible();

  const focusedSeed = await seedCounteractWindow(page);
  expect(focusedSeed?.eligibleUnitId).toBeTruthy();
  await waitForCounteractWindow(page);

  await expect(page.getByTestId("action-counteract")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pass" })).toBeVisible();

  await page.getByTestId("action-counteract").click();

  await expect(page.getByTestId("action-reposition")).toBeVisible();
  await expect(page.getByTestId("action-shoot")).toBeVisible();
  await expect(page.getByTestId("action-fight")).toBeVisible();
  await expect(page.getByTestId("action-pick-up-marker")).toBeVisible();
  await expect(page.getByTestId("action-place-marker")).toBeVisible();
  await expect(page.getByTestId("action-fall-back")).toHaveCount(0);

  const apBefore = await page.evaluate((unitId) => {
    const state = window.ktGetGameState?.();
    const unit = state?.game?.find((entry) => entry.id === unitId);
    return Number(unit?.state?.apCurrent ?? unit?.stats?.apl ?? 0);
  }, focusedSeed.eligibleUnitId);

  await page.getByTestId("action-reposition").click();

  const ev = await lastGameEvent(page);
  expect(ev.type).toBe("ACTION_USE");
  expect(ev.payload.actionKey).toBe("reposition");

  const apAfter = await page.evaluate((unitId) => {
    const state = window.ktGetGameState?.();
    const unit = state?.game?.find((entry) => entry.id === unitId);
    return Number(unit?.state?.apCurrent ?? unit?.stats?.apl ?? 0);
  }, focusedSeed.eligibleUnitId);

  expect(apAfter).toBe(apBefore);
});

test("units that already counteracted are excluded", async ({ page }) => {
  await page.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");

  const seeded = await seedCounteractWindow(page, { markOneCounteracted: true });
  expect(seeded?.eligibleUnitId).toBeTruthy();

  await page.getByTestId(`unit-card-${seeded.eligibleUnitId}`).click();
  await expect(page.getByTestId("unit-focused")).toBeVisible();

  const focusedSeed = await seedCounteractWindow(page, { markOneCounteracted: true });
  expect(focusedSeed?.eligibleUnitId).toBeTruthy();
  await waitForCounteractWindow(page);

  await expect(page.getByTestId("action-counteract")).toBeVisible();
  const counteractList = page.locator(".kt-action-card__counteract-list");
  await expect(counteractList).toBeVisible();
  await expect(
    counteractList.getByRole("button", { name: focusedSeed.counteractedUnitName }),
  ).toHaveCount(0);
});
