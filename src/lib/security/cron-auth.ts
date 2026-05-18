import { timingSafeEqual } from "node:crypto";

/**
 * Authentification des appels planifiés vers `/api/cron/daily-jobs`.
 * Comparaison en temps constant pour limiter les fuites par timing sur le secret.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function verifyCronSecretFromHeaders(
  authorization: string | null,
  xCronSecret: string | null,
  secret: string | undefined | null,
): boolean {
  const s = typeof secret === "string" ? secret.trim() : "";
  if (!s) return false;
  const auth = authorization ?? "";
  const bearerPrefix = "Bearer ";
  if (auth.startsWith(bearerPrefix)) {
    const token = auth.slice(bearerPrefix.length).trim();
    if (timingSafeStringEqual(token, s)) {
      return true;
    }
  }
  const headerSecret = (xCronSecret ?? "").trim();
  return timingSafeStringEqual(headerSecret, s);
}
