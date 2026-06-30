/**
 * Supprime les retours chariot / sauts de ligne des en-têtes email (injection CRLF).
 */
export function sanitizeEmailHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function sanitizeEmailAddressList(addresses: string[]): string[] {
  return addresses
    .map((addr) => sanitizeEmailHeaderValue(addr))
    .filter((addr) => addr.length > 0 && addr.includes("@"));
}
