import { listProduits } from "@/lib/lonaci/referentials";
import { filterUnknownProduitAutorisesCodes } from "@/lib/lonaci/produit-autorises-validation";

/** Codes absents du référentiel actif en base (`AUTRES` exclu de la vérification). */
export async function findInvalidProduitAutorisesCodes(codes: string[]): Promise<string[]> {
  const produits = await listProduits();
  const activeCodes = produits.filter((p) => p.actif).map((p) => p.code);
  return filterUnknownProduitAutorisesCodes(codes, activeCodes);
}
