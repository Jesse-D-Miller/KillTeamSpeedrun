import { test, expect } from "@playwright/test";
import { lastGameEvent } from "./helpers";

async function goToFocusedActiveUnit(page) {
  // Start at army, click first unit, activate engage, ensure actions visible
  await page.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");

  const firstCard = page
    .getByTestId("unit-grid")
    .locator("[data-testid^='unit-card-']")
    .first();
  await firstCard.click();

  await expect(page.getByTestId("unit-focused")).toBeVisible();

  // Activate so action buttons render
  await page.getByTestId("action-activate-engage").click();

  // Ensure Actions panel is there
  await expect(page.getByTestId("actions-panel")).toBeVisible();
}

test("dash dispatches ACTION_USE with dash", async ({ page }) => {
  await goToFocusedActiveUnit(page);

  await page.getByTestId("action-dash").click();

  const ev = await lastGameEvent(page);
  expect(ev.type).toBe("ACTION_USE");
  expect(ev.payload.actionKey).toBe("dash");
});

test("reposition dispatches ACTION_USE with reposition", async ({ page }) => {
  await goToFocusedActiveUnit(page);

  await page.getByTestId("action-reposition").click();

  const ev = await lastGameEvent(page);
  expect(ev.type).toBe("ACTION_USE");
  expect(ev.payload.actionKey).toBe("reposition");
});

test("charge dispatches ACTION_USE with charge", async ({ page }) => {
  await goToFocusedActiveUnit(page);

  await page.getByTestId("action-charge").click();

  const ev = await lastGameEvent(page);
  expect(ev.type).toBe("ACTION_USE");
  expect(ev.payload.actionKey).toBe("charge");
});

test("fall back dispatches ACTION_USE with fallBack", async ({ page }) => {
  await goToFocusedActiveUnit(page);

  await page.getByTestId("action-fall-back").click();

  const ev = await lastGameEvent(page);
  expect(ev.type).toBe("ACTION_USE");
  expect(ev.payload.actionKey).toBe("fallBack");
});

test("pick up marker dispatches ACTION_USE with pickUpMarker", async ({ page }) => {
  await goToFocusedActiveUnit(page);

  await page.getByTestId("action-pick-up-marker").click();

  const ev = await lastGameEvent(page);
  expect(ev.type).toBe("ACTION_USE");
  expect(ev.payload.actionKey).toBe("pickUpMarker");
});

test("place marker dispatches ACTION_USE with placeMarker", async ({ page }) => {
  await goToFocusedActiveUnit(page);

  await page.getByTestId("action-place-marker").click();

  const ev = await lastGameEvent(page);
  expect(ev.type).toBe("ACTION_USE");
  expect(ev.payload.actionKey).toBe("placeMarker");
});

test("fight dispatches ACTION_USE with fight (or opens fight flow)", async ({ page }) => {
  await goToFocusedActiveUnit(page);

  await page.getByTestId("action-fight").click();

  // If fight is implemented as ACTION_USE:
  const ev = await lastGameEvent(page);

  // If your fight opens a modal flow instead, swap this to:
  // await expect(page.getByTestId("fight-modal-pick-weapons")).toBeVisible();

  expect(ev.type).toBe("ACTION_USE");
  expect(ev.payload.actionKey).toBe("fight");
});

test("shoot opens target select (or dispatches ACTION_USE shoot)", async ({ page }) => {
  await goToFocusedActiveUnit(page);

  await page.getByTestId("action-shoot").click();

  // If shoot routes to target select:
  await expect(page).toHaveURL(/\/jesse\/target-select/);

  // If instead it's ACTION_USE, replace with the ACTION_USE assertion like others.
});

test("end activation dispatches END_ACTIVATION then navigates back to /army", async ({ page }) => {
  await goToFocusedActiveUnit(page);

  await page.getByTestId("action-end-activation").click();

  // Your handleEndActivation does END_ACTIVATION then navigate(/army)
  const ev = await lastGameEvent(page);
  expect(ev.type).toBe("END_ACTIVATION");

  await expect(page).toHaveURL(/\/jesse\/army/);
});
