import { test, expect } from "@playwright/test";

async function openAttackResolution(page, { weaponRules } = {}) {
  if (weaponRules) {
    await page.addInitScript((rules) => {
      window.__ktE2E_weaponRules = rules;
    }, weaponRules);
  }

  await page.goto("/e2e/attack-resolution");
  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible();
}

const playerRules = [
  {
    name: "Balanced",
    rules: ["balanced"],
    label: "Balanced",
    body: "reroll 1 attack die",
  },
  {
    name: "Ceaseless",
    rules: ["ceaseless"],
    label: "Ceaseless",
    body: "reroll all dice showing",
  },
  {
    name: "Relentless",
    rules: ["relentless"],
    label: "Relentless",
    body: "reroll any/all",
  },
  {
    name: "Accurate",
    rules: [{ id: "accurate", value: 1 }],
    label: "Accurate 1",
    body: "convert up to 1 attack dice",
  },
];

for (const rule of playerRules) {
  test(`${rule.name} shows tooltip guidance`, async ({ page }) => {
    await openAttackResolution(page, { weaponRules: rule.rules });

    const chip = page.locator(".wr-chip", { hasText: rule.label });
    await expect(chip).toBeVisible();
    await chip.click();

    const popover = page.getByTestId("weapon-rules-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText(rule.label);
    await expect(popover).toContainText(rule.body);

    await page.locator(".attack-resolution__main").click({ position: { x: 10, y: 10 } });
    await expect(popover).toBeHidden();
  });
}
