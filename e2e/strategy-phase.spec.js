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

  await page.getByTestId("initiative-A").click();

  await expect(page.getByTestId("strategy-ploys")).toBeVisible();
});

test("firefight button navigates to /army when enabled", async ({ page }) => {
  await page.goto("/jesse/strategy-phase?e2e=1&slot=A&armyKey=kommandos");

  await page.evaluate(() => {
    window.ktE2E_resetToStrategySeed?.({ turningPoint: 1 });
  });

  await page.getByTestId("initiative-A").click();
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
