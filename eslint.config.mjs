import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import pluginSecurity from "eslint-plugin-security";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/api/**/*.ts", "src/lib/**/*.ts", "scripts/**/*.ts"],
    ...pluginSecurity.configs.recommended,
    rules: {
      ...pluginSecurity.configs.recommended.rules,
      // Chemins fichiers validés en amont (IDs, pièces jointes) — trop de faux positifs sur storage/*
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-object-injection": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright (dossiers parfois absents après nettoyage ; évite ENOENT au scan)
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
