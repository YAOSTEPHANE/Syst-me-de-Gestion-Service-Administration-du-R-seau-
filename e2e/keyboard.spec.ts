import { expect, test } from "@playwright/test";

test.describe("navigation clavier ciblée", () => {
  test("le shell répond au clavier selon la largeur", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(500);

    if (testInfo.project.name === "desktop-1440") {
      const app = page.locator(".lonaci-db-app");
      await expect(app).not.toHaveClass(/lonaci-db-sidebar-collapsed/);
      await page.keyboard.press("Control+b");
      await expect(app).toHaveClass(/lonaci-db-sidebar-collapsed/);
      await page.keyboard.press("Control+b");
      await expect(app).not.toHaveClass(/lonaci-db-sidebar-collapsed/);
      return;
    }

    const opener = page.getByRole("button", { name: "Ouvrir le menu" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "Navigation principale" });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(":focus")).toBeAttached();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(opener).toBeFocused();
  });

  test("le dialogue garde le focus et se ferme avec Échap", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/parametres?createUser=1", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Utilisateurs" }).click();
    const dialog = page.getByRole("dialog").filter({ hasText: "Créer" }).first();
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Shift+Tab");
    const focusStayedInside = await dialog.evaluate((element) => element.contains(document.activeElement));
    expect(focusStayedInside).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
