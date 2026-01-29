import { test, expect } from "@playwright/test";

test("strategy phase loads (e2e)", async ({ page }) => {
  await page.goto("/jesse/strategy-phase?e2e=1&slot=A&armyKey=kommandos");

  await expect(page.getByTestId("screen-root")).toBeVisible();
  await expect(page.getByTestId("strategy-stepper")).toBeVisible();
  await expect(page.getByTestId("strategy-initiative")).toBeVisible();
  await expect(page.getByTestId("go-firefight")).toBeVisible();
});

test("strategy phase shows initiative buttons", async ({ page }) => {
  await page.goto("/jesse/strategy-phase?e2e=1&slot=A&armyKey=kommandos");

  await expect(page.getByTestId("initiative-A")).toBeVisible();
  await expect(page.getByTestId("initiative-B")).toBeVisible();
});

test("strategy phase shows stepper navigation", async ({ page }) => {
  await page.goto("/jesse/strategy-phase?e2e=1&slot=A&armyKey=kommandos");

  await expect(page.getByTestId("strategy-prev-step")).toBeVisible();
  await expect(page.getByTestId("strategy-next-step")).toBeVisible();
});

test("set initiative -> ploys UI appears", async ({ page }) => {
  await page.goto("/jesse/strategy-phase?e2e=1&slot=A&armyKey=kommandos");

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return Boolean(state?.phase || state?.topBar?.phase);
  });

  await page.getByTestId("initiative-A").click();

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return Boolean(
      state?.topBar?.initiativePlayerId ||
        state?.initiativePlayerId ||
        state?.initiative?.winnerPlayerId,
    );
  });

  await expect(page.getByTestId("strategy-ploys")).toBeVisible();
});

test("firefight button navigates to /army when enabled", async ({ page }) => {
  await page.goto("/jesse/strategy-phase?e2e=1&slot=A&armyKey=kommandos");

  await page.evaluate(() => {
    window.ktE2E_resetToStrategySeed?.({ turningPoint: 2 });
  });

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return Boolean(state?.phase || state?.topBar?.phase);
  });

  await page.getByTestId("initiative-A").click();

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return Boolean(
      state?.topBar?.initiativePlayerId ||
        state?.initiativePlayerId ||
        state?.initiative?.winnerPlayerId,
    );
  });
  await expect(page.getByTestId("strategy-ploys")).toBeVisible();

  await page.evaluate(() => {
    window.ktSetGameState?.({
      phase: "STRATEGY",
      topBar: { initiativePlayerId: "A", phase: "STRATEGY", turningPoint: 1 },
      strategy: {
        activeChooserPlayerId: null,
        passedByPlayer: { A: true, B: true },
      },
    });
  });

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return (
      state?.strategy?.passedByPlayer?.A === true &&
      state?.strategy?.passedByPlayer?.B === true &&
      state?.topBar?.initiativePlayerId === "A"
    );
  });

  const btn = page.getByTestId("go-firefight");

  await expect(btn).toBeEnabled();

  await btn.click();
  await expect(page).toHaveURL(/\/jesse\/army/);
});

test("ready operatives step completes and advances", async ({ page }) => {
  await page.goto("/jesse/strategy-phase?e2e=1&slot=A&armyKey=kommandos");

  await page.evaluate(() => {
    window.__ktE2E_gameEvents = [];
    window.__ktE2E_stepperComplete = false;
  });

  await page.waitForFunction(() => typeof window.ktE2E_resetToStrategySeed === "function");
  await page.evaluate(() => {
    window.ktE2E_resetToStrategySeed?.({ turningPoint: 2 });
  });

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return (state?.topBar?.phase ?? state?.phase) === "STRATEGY";
  });

  await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    if (!state) return;
    window.ktSetGameState?.({
      ...state,
      initiativePlayerId: null,
      initiative: { winnerPlayerId: null },
      topBar: {
        ...(state.topBar || {}),
        phase: "STRATEGY",
        initiativePlayerId: null,
      },
      strategy: {
        ...(state.strategy || {}),
        activeChooserPlayerId: null,
        passedByPlayer: { A: false, B: false },
        cpAwardedForTP: null,
        cpGrantedThisTP: false,
        operativesReadiedThisTP: false,
      },
    });
  });

  await expect(page.getByTestId("strategy-stepper")).toBeVisible();

  await page.waitForFunction(() => {
    const events = window.__ktE2E_gameEvents || [];
    return events.some((event) => event?.type === "READY_ALL_OPERATIVES");
  });

  await page.waitForFunction(() => window.__ktE2E_stepperComplete === true);

  const stepper = page.getByTestId("strategy-stepper");
  await expect(stepper).toContainText("Step 2/4");
  await expect(stepper).toContainText("Determine initiative");
});
