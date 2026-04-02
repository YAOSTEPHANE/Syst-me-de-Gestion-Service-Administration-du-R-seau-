/**
 * Authentification des appels planifiés vers `/api/cron/daily-jobs`.
 */
export function verifyCronSecretFromHeaders(
  authorization: string | null,
  xCronSecret: string | null,
  secret: string | undefined | null,
): boolean {
  const s = typeof secret === "string" ? secret.trim() : "";
  if (!s) return false;
  const bearer = authorization ?? "";
  if (bearer === `Bearer ${s}`) return true;
  return (xCronSecret ?? "").trim() === s;
}
