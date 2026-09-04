import { expect, test } from "@playwright/test";

/**
 * Smoke parcours métier critiques (menu + écrans clés).
 * Dépend de l’auth Playwright (storageState) et d’un serveur déjà démarré via webServer.
 */
test.describe("smoke parcours critiques", () => {
  test("dashboard affiche le contenu principal", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
    await expect(page.locator("main.lonaci-db-content")).toBeVisible();
  });

  test("contrats : page module accessible", async ({ page }) => {
    await page.goto("/contrats");
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
    await expect(page.locator("main.lonaci-db-content")).toBeVisible();
  });

  test("paramètres référentiels : hub documents à fournir", async ({ page }) => {
    await page.goto("/parametres?tab=referentiels");
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
    const main = page.locator("main.lonaci-db-content");
    await expect(main).toBeVisible();
    // CHEF_SERVICE voit le hub ; les autres rôles voient la restriction — les deux sont OK.
    const hub = page.getByText("Documents à fournir");
    const restriction = page.getByText(/réservés au rôle|Change d’abord ton mot de passe/i);
    await expect(hub.or(restriction).first()).toBeVisible({ timeout: 20_000 });
  });

  test("paramètres supervision : bandeau mode de validation", async ({ page }) => {
    await page.goto("/parametres?tab=supervision");
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
    const mode = page.getByText(/Circuit de validation/i);
    const restriction = page.getByText(/réservés au rôle|Change d’abord ton mot de passe/i);
    await expect(mode.or(restriction).first()).toBeVisible({ timeout: 20_000 });
  });

  test("cessions et successions ouvrent sans erreur serveur", async ({ page }) => {
    for (const path of ["/cessions", "/succession"] as const) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBeLessThan(500);
      await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
      await expect(page.locator("main.lonaci-db-content")).toBeVisible();
    }
  });
});
