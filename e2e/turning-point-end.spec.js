import { test, expect } from "@playwright/test";

async function seedTurningPointEnd(page, { tp = 2 } = {}) {
  await page.waitForFunction(() => typeof window.ktSetGameState === "function");
  await page.evaluate(
    ({ tpValue }) => {
      const state = window.ktGetGameState?.();
      if (!state) return;
      window.ktSetGameState?.({
        ...state,
        phase: "TURNING_POINT_END",
        turningPoint: tpValue,
        topBar: {
          ...(state.topBar || {}),
          phase: "TURNING_POINT_END",
          turningPoint: tpValue,
          initiativePlayerId: null,
        },
        firefight: {
          ...(state.firefight || {}),
          activeOperativeId: null,
          activePlayerId: null,
          orderChosenThisActivation: false,
          awaitingOrder: false,
          awaitingActions: false,
        },
        ui: { ...(state.ui || {}), actionFlow: null },
      });
    },
    { tpValue: tp },
  );
  await page.waitForFunction(
    (tpValue) => {
      const state = window.ktGetGameState?.();
      return (
        state?.phase === "TURNING_POINT_END" &&
        Number(state?.turningPoint) === Number(tpValue)
      );
    },
    tp,
  );
}

test("turning point end screen shows next turning point", async ({ page }) => {
  await page.goto("/jesse/turning-point-end?e2e=1&slot=A&armyKey=kommandos");
  await seedTurningPointEnd(page, { tp: 2 });

  await expect(page.getByTestId("turning-point-end")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /End of Turning Point 2/i }),
  ).toBeVisible();
  await expect(page.getByText(/Start Turning Point 3/i)).toBeVisible();
});

test("clicking continue advances to strategy phase", async ({ page }) => {
  await page.goto("/jesse/turning-point-end?e2e=1&slot=A&armyKey=kommandos");
  await seedTurningPointEnd(page, { tp: 2 });

  await page.getByRole("button", { name: /End of Turning Point 2/i }).click();

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return state?.phase === "STRATEGY" && Number(state?.turningPoint) === 3;
  });

  await expect(page).toHaveURL(/\/jesse\/strategy-phase/);
});

test("player B can continue the turning point", async ({ page }) => {
  await page.goto("/jesse/turning-point-end?e2e=1&slot=B&armyKey=kommandos");
  await seedTurningPointEnd(page, { tp: 3 });

  await page.getByRole("button", { name: /End of Turning Point 3/i }).click();

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return state?.phase === "STRATEGY" && Number(state?.turningPoint) === 4;
  });

  await expect(page).toHaveURL(/\/jesse\/strategy-phase/);
});

test("strategy page renders only after phase advances", async ({ page }) => {
  await page.goto("/jesse/turning-point-end?e2e=1&slot=A&armyKey=kommandos");
  await seedTurningPointEnd(page, { tp: 1 });

  await page.getByRole("button", { name: /End of Turning Point 1/i }).click();

  await expect(page).toHaveURL(/\/jesse\/strategy-phase/);

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return state?.phase === "STRATEGY" && Number(state?.turningPoint) === 2;
  });
});

test("strategy top bar shows STRATEGY and next TP", async ({ page }) => {
  await page.goto("/jesse/turning-point-end?e2e=1&slot=A&armyKey=kommandos");
  await seedTurningPointEnd(page, { tp: 2 });

  await page.getByRole("button", { name: /End of Turning Point 2/i }).click();

  await page.waitForURL(/\/jesse\/strategy-phase/);

  const topBar = page.getByTestId("topbar");
  const phaseItem = topBar.locator(".kt-topbar__item", { hasText: "Phase" });
  const tpItem = topBar.locator(".kt-topbar__item", { hasText: "Turning Point" });

  await expect(phaseItem.locator(".kt-topbar__value")).toHaveText("STRATEGY");
  await expect(tpItem.locator(".kt-topbar__value")).toHaveText("3");
});
