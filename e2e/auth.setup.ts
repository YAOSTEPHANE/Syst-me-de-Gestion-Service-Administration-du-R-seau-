import { mkdirSync } from "node:fs";
import path from "node:path";

import { test as setup, expect } from "@playwright/test";

const authFile = path.join(__dirname, "../playwright/.auth/user.json");

setup("connexion et enregistrement de session", async ({ page }) => {
  const email =
    process.env.E2E_ADMIN_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "admin@lonaci.ci";
  const password =
    process.env.E2E_ADMIN_PASSWORD?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    "Admin@123456";

  mkdirSync(path.dirname(authFile), { recursive: true });

  await page.goto("/login");
  await page.getByLabel("Identifiant (email ou matricule)").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard(\/|$)/);

  await page.context().storageState({ path: authFile });
});
