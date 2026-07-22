/** Code référentiel pour les produits hors catalogue standard. */
export const OTHER_PRODUCT_CODE = "AUTRES";

/** Montant caution référentiel = prix produit + prix kit (optionnel). */
export function produitMontantCautionReferentiel(p: {
  prix?: number | null;
  prixKit?: number | null;
}): number | null {
  const prix =
    typeof p.prix === "number" && Number.isFinite(p.prix) ? Math.max(0, Math.round(p.prix)) : null;
  if (prix === null) return null;
  const kit =
    typeof p.prixKit === "number" && Number.isFinite(p.prixKit)
      ? Math.max(0, Math.round(p.prixKit))
      : 0;
  return prix + kit;
}