import { mkdirSync } from "node:fs";
import path from "node:path";

import { test as setup, expect, type Page } from "@playwright/test";

const authFile = path.join(__dirname, "../playwright/.auth/user.json");

async function openLogin(page: Page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.waitForTimeout(1_000);
    }
  }
}

setup("connexion et enregistrement de session", async ({ page }) => {
  setup.setTimeout(180_000);
  const email =
    process.env.E2E_ADMIN_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "admin@lonaci.ci";
  const password =
    process.env.E2E_ADMIN_PASSWORD?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    "Admin@123456";

  mkdirSync(path.dirname(authFile), { recursive: true });

  await openLogin(page);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await page.getByLabel("Identifiant (email ou matricule)").fill(email);
  await page.locator("#login-password").fill(password);
  const loginResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/login") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Se connecter" }).click();
  expect((await loginResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/dashboard(\/|$)/, { timeout: 45_000 });

  await page.context().storageState({ path: authFile });
});
