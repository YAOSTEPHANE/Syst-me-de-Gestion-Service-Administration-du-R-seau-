import { test, expect } from "@playwright/test";

import { LONACI_NAV } from "../src/components/lonaci/lonaci-nav";

/** Hors menu latéral (vue chrome allégée pour l’impression). */
const EXTRA_AUTH_PATHS = ["/rapports/print"] as const;

test.describe("Application authentifiée", () => {
  test("chaque entrée du menu latéral ouvre la page attendue", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("aside.lonaci-db-sidebar nav.lonaci-db-nav")).toBeVisible();

    for (const item of LONACI_NAV) {
      if (item.disabled) continue;
      const link = page
        .locator("aside.lonaci-db-sidebar nav.lonaci-db-nav")
        .locator(`a.lonaci-db-nav-item[href="${item.href}"]`);
      if ((await link.count()) === 0) continue;
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${escapeRegex(item.href)}(\\?|$)`));
      await expect(page.locator("main.lonaci-db-content")).toBeVisible();
    }
  });

  test("page hors menu principal (impression rapports)", async ({ page }) => {
    for (const href of EXTRA_AUTH_PATHS) {
      await page.goto(href);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: /^Rapport/ })).toBeVisible();
    }
  });

  test("lien tableau de bord vers les alertes", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: /Voir toutes les alertes/ }).click();
    await expect(page).toHaveURL(/\/alertes/);
    await expect(page.locator("main.lonaci-db-content")).toBeVisible();
  });
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
