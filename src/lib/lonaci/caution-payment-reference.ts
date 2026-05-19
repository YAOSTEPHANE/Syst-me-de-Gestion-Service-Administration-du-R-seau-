import {
  allocateCautionPaymentReference,
  isCautionPaymentRefAutoGenerateEnabled,
} from "@/lib/lonaci/caution-fiche-definitive";

const PROVISOIRE_PREFIX = "PROVISOIRE:";

/** Référence provisoire interne (fiche non encore régularisée) — invalide pour statut PAYÉE. */
export function isProvisoirePlaceholderPaymentReference(ref: string | null | undefined): boolean {
  const t = (ref ?? "").trim();
  if (!t) return true;
  return t.toUpperCase().startsWith(PROVISOIRE_PREFIX);
}

/** Référence exploitable pour un passage en PAYÉE (hors placeholder provisoire). */
export function hasValidPaymentReferenceForPayee(ref: string | null | undefined): boolean {
  return !isProvisoirePlaceholderPaymentReference(ref);
}

/**
 * Référence obligatoire pour statut PAYÉE : réutilise la référence saisie ou génère PAY-… si config active.
 */
export async function resolvePaymentReferenceForPayee(
  currentRef: string | null | undefined,
): Promise<string> {
  const trimmed = (currentRef ?? "").trim();
  if (hasValidPaymentReferenceForPayee(trimmed)) {
    return trimmed;
  }
  if (isCautionPaymentRefAutoGenerateEnabled()) {
    return allocateCautionPaymentReference();
  }
  throw new Error("CAUTION_PAYMENT_REFERENCE_REQUISE");
}
