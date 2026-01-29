import { test, expect } from "@playwright/test";

async function goToUnitSelector(page) {
  await page.goto("/jesse/army-selector");

  await page.getByRole("button", { name: /Kommandos/i }).click();
  await page.getByRole("button", { name: /Hernkyn/i }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByTestId("screen-root")).toBeVisible();
}

test("default loadout selects 4 faction equipment and Start requires 4 selections", async ({ page }) => {
  await goToUnitSelector(page);

  const factionSection = page
    .locator(".unit-selector__section")
    .filter({ hasText: "Faction Equipment" });

  await expect(factionSection.getByText("4/4 selected")).toBeVisible();
  await expect(
    factionSection.locator(
      ".unit-selector__equipment-tile.unit-selector__tile--selected",
    ),
  ).toHaveCount(4);

  const equipmentNames = [
    "Choppas",
    "Harpoon",
    "Dynamite",
    "Collapsible Stocks",
  ];

  for (const name of equipmentNames) {
    await page.getByRole("button", { name }).click();
  }

  await expect(factionSection.getByText("0/4 selected")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(factionSection.getByText("0/4 selected")).toBeVisible();

  const startButton = page.getByRole("button", { name: "Start" });
  await expect(startButton).toBeDisabled();

  for (const name of equipmentNames) {
    await page.getByRole("button", { name }).click();
  }

  await expect(factionSection.getByText("4/4 selected")).toBeVisible();
  await expect(startButton).toBeEnabled();
});
