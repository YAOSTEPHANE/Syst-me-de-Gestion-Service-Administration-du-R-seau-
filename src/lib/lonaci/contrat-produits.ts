import type { ProduitDocument } from "@/lib/lonaci/types";
import { findProduitByCode } from "@/lib/lonaci/referentials";

export { produitAutorisePourConcessionnaire } from "@/lib/lonaci/contrat-produit-rules";

/**
 * Résout le produit référentiel : code exact, sinon famille LOT/PMU si seul le code agrégé existe en base.
 * Réservé au serveur (importe Mongo via referentials).
 */
export async function resolveProduitForContratWorkflow(code: string): Promise<ProduitDocument | null> {
  const c = code.trim().toUpperCase();
  let row = await findProduitByCode(c);
  if (row) return row;
  if (c.startsWith("LOTO_")) {
    row = await findProduitByCode("LOTO");
    if (row) return row;
  }
  if (c.startsWith("PMU_")) {
    row = await findProduitByCode("PMU");
    if (row) return row;
  }
  return null;
}
