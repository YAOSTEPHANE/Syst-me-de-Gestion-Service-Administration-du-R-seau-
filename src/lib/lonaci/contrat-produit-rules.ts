/**
 * Règles produit contrat / PDV — **sans** import Mongo/referentials (safe pour Client Components).
 */
export function produitAutorisePourConcessionnaire(autorises: string[], produitCode: string): boolean {
  const p = produitCode.trim().toUpperCase();
  const list = (autorises ?? []).map((x) => String(x).trim().toUpperCase());
  if (list.includes(p)) return true;
  if (list.includes("LOTO") && p.startsWith("LOTO_")) return true;
  if (list.includes("PMU") && p.startsWith("PMU_")) return true;
  return false;
}
