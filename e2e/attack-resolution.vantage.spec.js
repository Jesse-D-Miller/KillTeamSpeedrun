import { test, expect } from "@playwright/test";

/**
 * FIXES INCLUDED
 * 1) Avoids `networkidle` flake; waits for concrete app signals instead.
 * 2) Uses ONE shared context (two pages) so the attacker/defender views can actually sync
 *    via localStorage/BroadcastChannel/etc. (two separate contexts can’t share that).
 * 3) Makes “disabled” assertions more resilient.
 * 4) Adds a tiny settle wait after selecting vantage (React + event sync).
 */

const openVantageRoute = async (page, targetOrder, role) => {
  await page.goto(`/e2e/attack-resolution?targetOrder=${targetOrder}&role=${role}`);

  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible({
    timeout: 15000,
  });

  if (role === "attacker") {
    await page.getByTestId("condition-vantage").waitFor({
      state: "visible",
      timeout: 15000,
    });
  } else {
    await page.getByTestId("condition-cover").waitFor({
      state: "visible",
      timeout: 15000,
    });
  }
};

async function openAttackerDefender(browser, targetOrder) {
  // ✅ shared context
  const context = await browser.newContext();
  const attacker = await context.newPage();
  const defender = await context.newPage();

  await openVantageRoute(attacker, targetOrder, "attacker");
  await openVantageRoute(defender, targetOrder, "defender");

  return { attacker, defender, context };
}

async function expectCoverDisabled(coverLocator) {
  // You set aria-disabled, but this lets you evolve later without rewriting tests
  await expect(coverLocator).toHaveAttribute("aria-disabled", "true");
}

async function expectCoverEnabled(coverLocator) {
  await expect(coverLocator).toHaveAttribute("aria-disabled", "false");
}

test('Vantage 4": Accurate 2 and defender cover disabled (and clears on second click)', async ({
  browser,
}) => {
  const { attacker, defender, context } = await openAttackerDefender(browser, "engage");

  // Attacker should not be able to control cover in defender panel
  await expectCoverDisabled(attacker.getByTestId("condition-cover"));

  const vantage = attacker.getByTestId("condition-vantage");

  await vantage.click();
  await expect(attacker.getByTestId("vantage-chooser")).toBeVisible();
  await attacker.getByTestId("vantage-choose-4").click();

  // Give UI a breath to apply modifiers + rerender chips
  await attacker.waitForTimeout(25);

  // Accurate from vantage should show up in PRE-ROLL weapon rules
  await expect(
    attacker.getByTestId("wr-chip-accurate-vantage-2").first(),
  ).toBeVisible({ timeout: 15000 });

  // Defender cover should become unavailable and not applied
  const cover = defender.getByTestId("condition-cover");
  await expectCoverDisabled(cover);
  await expect(cover).not.toHaveClass(/is-applied/);

  // Second click clears vantage + accurate + re-enables cover
  await vantage.click();
  await attacker.waitForTimeout(25);

  await expect(attacker.getByTestId("wr-chip-accurate-vantage-2")).toHaveCount(0);
  await expectCoverEnabled(cover);

  await context.close();
});

test('Vantage 2": Accurate 1 and defender cover disabled', async ({ browser }) => {
  const { attacker, defender, context } = await openAttackerDefender(browser, "engage");

  const vantage = attacker.getByTestId("condition-vantage");
  await vantage.click();

  await expect(attacker.getByTestId("vantage-chooser")).toBeVisible();
  await attacker.getByTestId("vantage-choose-2").click();

  await attacker.waitForTimeout(25);

  await expect(
    attacker.getByTestId("wr-chip-accurate-vantage-1").first(),
  ).toBeVisible({ timeout: 15000 });

  const cover = defender.getByTestId("condition-cover");
  await expectCoverDisabled(cover);
  await expect(cover).not.toHaveClass(/is-applied/);

  await context.close();
});
