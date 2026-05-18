/**
 * Échappe une chaîne pour l’utiliser comme motif littéral dans RegExp / $regex MongoDB.
 * Réduit ReDoS et injections de métacaractères.
 */
export function escapeRegexLiteral(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
