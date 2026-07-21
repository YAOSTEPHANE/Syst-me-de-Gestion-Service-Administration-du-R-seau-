import { expect, test } from "@playwright/test";

test("snapshot ciblé — famille publique connexion", async ({ page }, testInfo) => {
  test.skip(Boolean(process.env.CI), "Référence visuelle locale, sensible aux polices système");
  test.skip(testInfo.project.name !== "public-desktop-1440", "Référence visuelle desktop unique");
  await page.goto("/login");
  const form = page.locator("main section").first();
  await expect(form).toBeVisible();
  await expect(form).toHaveScreenshot("login-desktop.png", {
    animations: "disabled",
    caret: "hide",
  });
});
