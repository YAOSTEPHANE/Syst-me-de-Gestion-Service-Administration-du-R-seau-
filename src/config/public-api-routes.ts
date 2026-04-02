/**
 * Fichiers `route.ts` sous `src/app/api` qui ne contiennent pas `requireApiAuth`.
 *
 * - **Public** : santé, login, logout, demande de reset, signatures par token, cron (secret dédié).
 * - **Délégué** : réexport vers une route qui applique déjà `requireApiAuth`.
 *
 * Toute nouvelle route API doit soit appeler requireApiAuth, soit être ajoutée ici
 * et documentée. Le script npm run check:api-routes échoue sinon.
 *
 * Si une route est publique sans cookie, ajoutez aussi le chemin dans
 * isPublicApiPath (src/proxy.ts) pour éviter un 401 avant le handler.
 */
export const PUBLIC_OR_DELEGATED_API_ROUTE_SUFFIXES = [
  "health/route.ts",
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/reset-password/request/route.ts",
  "signatures/dossier/[token]/route.ts",
  "cron/daily-jobs/route.ts",
  "import-data/route.ts",
  "admr/alert-thresholds/route.ts",
  "admr-registries/route.ts",
  "admr-registries/[id]/route.ts",
] as const;
