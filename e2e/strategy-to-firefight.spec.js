import { test, expect } from "@playwright/test";

test("strategy ends -> phase flips to FIREFIGHT -> then navigates to /army", async ({ page }) => {
  await page.goto("/jesse/strategy-phase?e2e=1&slot=A&armyKey=kommandos");

  await page.evaluate(() => {
    window.ktE2E_resetToStrategySeed?.({ turningPoint: 1 });
  });

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return Boolean(state?.phase || state?.topBar?.phase);
  });

  // Set initiative so ploys become relevant
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

  // Simulate both players locking in ploys
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

  // Click to end strategy (should NOT navigate immediately anymore)
  await btn.click();

  // Confirm we are still on the strategy route right after click
  await expect(page).toHaveURL(/\/jesse\/strategy-phase/);

  // Wait until shared state flips phase to FIREFIGHT, then your effect should navigate
  await page.waitForURL(/\/jesse\/army/, { timeout: 10000 });
});
