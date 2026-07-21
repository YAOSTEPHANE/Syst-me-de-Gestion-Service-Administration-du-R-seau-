import { expect, test, type Page } from "@playwright/test";

import { AUTHENTICATED_ROUTES } from "./route-inventory";

const HYDRATION_ERROR = /hydration|hydrated|server rendered html|content does not match/i;
const RESPONSIVE_ROUTE_PATHS = new Set([
  "/dashboard",
  "/clients",
  "/dossiers",
  "/bancarisation",
  "/rapports",
  "/parametres",
]);

function watchRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    scrollX: (() => {
      window.scrollTo({ left: document.documentElement.scrollWidth, top: window.scrollY });
      const value = window.scrollX;
      window.scrollTo({ left: 0, top: window.scrollY });
      return value;
    })(),
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > window.innerWidth + 1 || rect.left < -1;
      })
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
  }));
  expect(
    dimensions.scrollX,
    `Débordement horizontal: ${dimensions.documentWidth}px pour ${dimensions.viewportWidth}px; ${dimensions.offenders.join(", ")}`,
  ).toBe(0);
}

test.describe("smoke responsive des routes principales", () => {
  for (const route of AUTHENTICATED_ROUTES) {
    test(`${route.family} — ${route.label}`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      test.skip(
        testInfo.project.name !== "desktop-1440" && !RESPONSIVE_ROUTE_PATHS.has(route.path),
        "Inventaire exhaustif sur desktop, une route représentative par famille sur tablette/mobile",
      );
      const runtimeErrors = watchRuntimeErrors(page);
      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });

      expect(response?.status(), `${route.path} doit répondre sans erreur serveur`).toBeLessThan(500);
      await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
      await expect(page.locator("main.lonaci-db-content")).toBeVisible();
      await expect(page.locator("nav.lonaci-db-nav, nav.lonaci-db-mobile-nav").first()).toBeAttached();
      await expectNoHorizontalOverflow(page);

      const unnamedInteractive = await page
        .locator("button:not([aria-label]):not([title]), a[href]:not([aria-label]):not([title])")
        .evaluateAll((elements) => elements.filter((element) => !element.textContent?.trim()).length);
      expect(unnamedInteractive, `${route.path} ne doit pas exposer de contrôle sans nom`).toBe(0);
      expect(runtimeErrors.filter((message) => HYDRATION_ERROR.test(message))).toEqual([]);
      expect(runtimeErrors, `Erreurs navigateur sur ${route.path}`).toEqual([]);
    });
  }
});

test("cibles CSS 320/375/768/1024/1440", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Contrôle consolidé sur Chromium desktop");
  const runtimeErrors = watchRuntimeErrors(page);

  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width <= 768 ? 844 : 900 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main.lonaci-db-content")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  expect(runtimeErrors).toEqual([]);
});
