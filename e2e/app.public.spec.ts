import { test, expect } from "@playwright/test";

test.describe("Routes publiques", () => {
  test("la racine redirige vers la connexion", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Connexion sécurisée" })).toBeVisible();
  });

  test("la page de connexion affiche le formulaire", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Identifiant (email ou matricule)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });
});
