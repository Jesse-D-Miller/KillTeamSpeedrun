import { test, expect } from "@playwright/test";
import { lastCombatEvent, lastGameEvent } from "./helpers";

test("target select renders and confirm is disabled until a primary is selected", async ({ page }) => {
  await page.goto(
    "/jesse/target-select?e2e=1&mode=shoot&slot=A&attackerId=alpha:kommando-bomb-squig",
  );

  await expect(page.getByTestId("target-select-screen")).toBeVisible();
  await expect(page.getByTestId("target-select-modal")).toBeVisible();

  await expect(page.getByTestId("target-confirm")).toBeDisabled();

  // click first target
  const firstTarget = page.locator("[data-testid^='target-beta:']").first();
  await expect(firstTarget).toBeVisible();
  await firstTarget.press("Enter");

  await expect(page.getByTestId("target-confirm")).toBeEnabled();
});

test("cancel closes and dispatches FLOW_CANCEL in shoot mode", async ({ page }) => {
  await page.goto(
    "/jesse/target-select?e2e=1&mode=shoot&slot=A&attackerId=alpha:kommando-bomb-squig",
  );

  await page.getByTestId("target-cancel").click();

  const ev = await lastGameEvent(page);
  expect(ev.type).toBe("FLOW_CANCEL");

  await expect(page).toHaveURL(/\/jesse\/army/);
});

test("confirm shoot dispatches START_RANGED_ATTACK and returns to /army", async ({ page }) => {
  await page.goto(
    "/jesse/target-select?e2e=1&mode=shoot&slot=A&attackerId=alpha:kommando-bomb-squig",
  );

  const firstTarget = page.locator("[data-testid^='target-beta:']").first();
  await expect(firstTarget).toBeVisible();
  const targetTestId = await firstTarget.getAttribute("data-testid");
  const targetId = targetTestId.replace("target-", "");

  await firstTarget.press("Enter");
  await page.getByTestId("target-confirm").click();

  const combatEv = await lastCombatEvent(page);
  expect(combatEv.type).toBe("START_RANGED_ATTACK");
  expect(combatEv.payload.attackerId).toBe("A");
  expect(combatEv.payload.defenderId).toBe("B");
  expect(combatEv.payload.attackingOperativeId).toBe("alpha:kommando-bomb-squig");
  expect(combatEv.payload.defendingOperativeId).toBe(targetId);

  const gameEv = await lastGameEvent(page);
  expect(gameEv.type).toBe("FLOW_CANCEL");

  await expect(page).toHaveURL(/\/jesse\/army/);
});

test("fight target select dispatches FLOW_SET_TARGET and returns to /army", async ({ page }) => {
  await page.goto(
    "/jesse/target-select?e2e=1&mode=fight&slot=A&attackerId=alpha:kommando-bomb-squig",
  );

  const firstTarget = page.locator("[data-testid^='target-beta:']").first();
  await expect(firstTarget).toBeVisible();
  const targetTestId = await firstTarget.getAttribute("data-testid");
  const targetId = targetTestId.replace("target-", "");

  await firstTarget.press("Enter");
  await page.getByTestId("target-confirm").click();

  const ev = await lastGameEvent(page);
  expect(ev.type).toBe("FLOW_SET_TARGET");
  expect(ev.payload.defenderId).toBe(targetId);

  await expect(page).toHaveURL(/\/jesse\/army/);
});

test("blast weapon allows secondary selection and passes inputs", async ({ page }) => {
  await page.goto(
    "/jesse/target-select?e2e=1&mode=shoot&slot=A&attackerId=alpha:kommando-bomb-squig",
  );

  const targets = page.locator("[data-testid^='target-beta:']");
  const t0 = targets.nth(0);
  const t1 = targets.nth(1);

  await expect(t0).toBeVisible();
  await expect(t1).toBeVisible();
  const id0 = (await t0.getAttribute("data-testid")).replace("target-", "");
  const id1 = (await t1.getAttribute("data-testid")).replace("target-", "");

  await t0.press("Enter");
  await t1.press("Enter");

  await page.getByTestId("target-confirm").click();

  const combatEv = await lastCombatEvent(page);
  expect(combatEv.type).toBe("START_RANGED_ATTACK");
  expect(combatEv.payload.inputs.primaryTargetId).toBe(id0);
  expect(combatEv.payload.inputs.secondaryTargetIds).toContain(id1);
});
