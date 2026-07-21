import { expect, test } from "@playwright/test";

test("snapshot ciblé — famille authentifiée shell", async ({ page }, testInfo) => {
  test.skip(Boolean(process.env.CI), "Référence visuelle locale, sensible aux polices système");
  test.skip(testInfo.project.name !== "desktop-1440", "Référence visuelle desktop unique");
  await page.goto("/dashboard");
  await page.locator("nextjs-portal").evaluateAll((portals) => {
    for (const portal of portals) portal.remove();
  });
  const sidebar = page.locator("aside.lonaci-db-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveScreenshot("shell-navigation-desktop.png", {
    animations: "disabled",
    caret: "hide",
    mask: [sidebar.locator(".lonaci-db-nav-badge")],
  });
});
