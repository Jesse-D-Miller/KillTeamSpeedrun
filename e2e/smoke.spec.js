import { test, expect } from "@playwright/test";

test("army screen loads in e2e mode", async ({ page }) => {
  await page.goto("/jesse/army?e2e=1&slot=A");
  await expect(page.getByTestId("screen-root")).toBeVisible();
  await expect(page.getByTestId("unit-grid")).toBeVisible();
});
