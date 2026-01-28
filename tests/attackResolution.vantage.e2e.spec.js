import { test, expect } from "@playwright/test";

test("engage: clicking Vantage shows 4\"/2\" chooser", async ({ page }) => {
  await page.goto("/e2e/attack-resolution?targetOrder=engage");
  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible();

  const vantage = page.getByTestId("condition-vantage");
  await expect(vantage).toBeVisible();
  await vantage.click();

  await expect(page.getByTestId("vantage-chooser")).toBeVisible();
  await expect(page.getByTestId("vantage-choose-4")).toBeVisible();
  await expect(page.getByTestId("vantage-choose-2")).toBeVisible();
});

test("engage: 4\" Vantage gives Accurate 2 and disables cover", async ({ page }) => {
  await page.goto("/e2e/attack-resolution?targetOrder=engage");
  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible();

  const vantage = page.getByTestId("condition-vantage");
  await expect(vantage).toBeVisible();
  await vantage.click();

  await page.getByTestId("vantage-choose-4").click();

  await expect(page.getByTestId("wr-chip-accurate-2")).toBeVisible();

  const cover = page.getByTestId("condition-cover");
  await expect(cover).toHaveAttribute("aria-disabled", "true");
  await expect(cover).not.toHaveClass(/is-applied/);

  await expect(page.getByTestId("vantage-chooser")).toBeHidden();
});

test("engage: 2\" Vantage gives Accurate 1 and disables cover", async ({ page }) => {
  await page.goto("/e2e/attack-resolution?targetOrder=engage");
  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible();

  const vantage = page.getByTestId("condition-vantage");
  await expect(vantage).toBeVisible();
  await vantage.click();

  await page.getByTestId("vantage-choose-2").click();

  await expect(page.getByTestId("wr-chip-accurate-1")).toBeVisible();

  const cover = page.getByTestId("condition-cover");
  await expect(cover).toHaveAttribute("aria-disabled", "true");
  await expect(cover).not.toHaveClass(/is-applied/);

  await expect(page.getByTestId("vantage-chooser")).toBeHidden();
});

test("conceal: no chooser and defender retain note", async ({ page }) => {
  await page.goto("/e2e/attack-resolution?targetOrder=conceal");
  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible();

  const vantage = page.getByTestId("condition-vantage");
  await expect(vantage).toBeVisible();
  await vantage.click();

  await expect(page.getByTestId("vantage-chooser")).toHaveCount(0);

  const note = page.getByTestId("rule-note-vantage-defender");
  await expect(note).toBeVisible();
  await expect(note).toContainText("retain 2 normal saves");
  await expect(note).toContainText("OR 1 crit save");
});

test("engage: reselecting Vantage switches accurate without stacking", async ({ page }) => {
  await page.goto("/e2e/attack-resolution?targetOrder=engage");
  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible();

  const vantage = page.getByTestId("condition-vantage");
  await expect(vantage).toBeVisible();
  await vantage.click();
  await page.getByTestId("vantage-choose-4").click();

  await expect(page.getByTestId("wr-chip-accurate-2")).toBeVisible();

  await vantage.click();
  await expect(page.getByTestId("wr-chip-accurate-2")).toHaveCount(0);

  await vantage.click();
  await page.getByTestId("vantage-choose-2").click();

  await expect(page.getByTestId("wr-chip-accurate-1")).toBeVisible();
  await expect(page.getByTestId("wr-chip-accurate-2")).toHaveCount(0);

  const cover = page.getByTestId("condition-cover");
  await expect(cover).toHaveAttribute("aria-disabled", "true");
});

test("engage: clicking applied Vantage clears effects", async ({ page }) => {
  await page.goto("/e2e/attack-resolution?targetOrder=engage");
  await expect(page.getByTestId("attack-resolution-modal")).toBeVisible();

  const vantage = page.getByTestId("condition-vantage");
  await vantage.click();
  await page.getByTestId("vantage-choose-4").click();

  await expect(page.getByTestId("wr-chip-accurate-2")).toBeVisible();

  await vantage.click();

  await expect(page.getByTestId("wr-chip-accurate-2")).toHaveCount(0);
  const cover = page.getByTestId("condition-cover");
  await expect(cover).toHaveAttribute("aria-disabled", "false");
});
