/**
 * Vérifie que chaque fichier route.ts sous src/app/api contient la chaîne
 * requireApiAuth ou est listé dans PUBLIC_OR_DELEGATED_API_ROUTE_SUFFIXES.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { PUBLIC_OR_DELEGATED_API_ROUTE_SUFFIXES } from "../src/config/public-api-routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..", "src", "app", "api");
const allow = new Set<string>(PUBLIC_OR_DELEGATED_API_ROUTE_SUFFIXES);
const violations: string[] = [];

function walk(dir: string): void {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      walk(full);
    } else if (name.name === "route.ts") {
      const rel = path.relative(apiRoot, full).split(path.sep).join("/");
      const content = fs.readFileSync(full, "utf8");
      if (!content.includes("requireApiAuth") && !allow.has(rel)) {
        violations.push(rel);
      }
    }
  }
}

walk(apiRoot);

if (violations.length > 0) {
  console.error(
    "[check-api-routes] Fichiers route.ts sans requireApiAuth (hors liste publique/déléguée) :\n",
    violations.map((v) => `  - ${v}`).join("\n"),
    "\n\nAjoutez requireApiAuth ou documentez la route dans src/config/public-api-routes.ts",
  );
  process.exit(1);
}

console.log("[check-api-routes] OK");
