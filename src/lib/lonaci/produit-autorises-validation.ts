import { OTHER_PRODUCT_CODE } from "@/lib/lonaci/produit-constants";

export { OTHER_PRODUCT_CODE } from "@/lib/lonaci/produit-constants";

export function normalizeProduitsAutorises(codes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of codes) {
    const normalized = raw.trim().toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/** Codes absents du référentiel actif (`AUTRES` exclu de la vérification). */
export function filterUnknownProduitAutorisesCodes(
  codes: string[],
  activeProduitCodes: Iterable<string>,
): string[] {
  const produitCodes = new Set(
    [...activeProduitCodes].map((code) => code.trim().toUpperCase()),
  );
  return normalizeProduitsAutorises(codes).filter((normalized) => {
    if (normalized === OTHER_PRODUCT_CODE) return false;
    return !produitCodes.has(normalized);
  });
}
