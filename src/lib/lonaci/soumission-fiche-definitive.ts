import "server-only";

import { CLIENT_TYPE_DISTRIBUTEUR_LABELS } from "@/lib/lonaci/client-constants";
import { getCautionEncaissementModeLabel } from "@/lib/lonaci/constants";
import { findAgenceById } from "@/lib/lonaci/referentials";
import { soumissionFicheCaisseReference } from "@/lib/lonaci/soumission-circuit";
import { SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA } from "@/lib/lonaci/soumission-paiement-constants";
import { findSoumissionById } from "@/lib/lonaci/soumissions";
import type { UserDocument } from "@/lib/lonaci/types";
import {
  renderSoumissionFicheDefinitivePdf,
  type SoumissionFicheDefinitiveView,
} from "@/lib/pdf/soumission-fiche-definitive";

export async function buildAndRenderSoumissionFicheDefinitivePdf(input: {
  soumissionId: string;
  actor: UserDocument;
}): Promise<{ pdf: Buffer; filename: string }> {
  const item = await findSoumissionById(input.soumissionId, input.actor);
  if (!item) throw new Error("SOUMISSION_NOT_FOUND");
  if (item.circuitStatut !== "PAYEE" || !item.numeroFicheDefinitive || !item.ficheDefinitiveEmiseLe) {
    throw new Error("SOUMISSION_NON_PAYEE");
  }

  const agence = await findAgenceById(item.agenceId);
  const view: SoumissionFicheDefinitiveView = {
    soumissionId: item.id,
    numeroFicheDefinitive: item.numeroFicheDefinitive,
    referenceFicheCaisse: soumissionFicheCaisseReference(item.id),
    emiseLe: item.ficheDefinitiveEmiseLe,
    nomComplet: item.nomComplet,
    contact: item.contact,
    typeDistributeurLabel:
      CLIENT_TYPE_DISTRIBUTEUR_LABELS[item.typeDistributeur] ?? item.typeDistributeur,
    nombreTpe: item.nombreTpe,
    produitCode: item.produitCode,
    agenceLabel: agence ? `${agence.code} — ${agence.libelle}` : item.agenceId,
    montantFCFA: SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA,
    modeLibelle: item.paymentMode ? getCautionEncaissementModeLabel(item.paymentMode) : "—",
    paymentReference: item.paymentReference ?? "—",
    validePar: item.circuitFinalizedByName ?? "Chef de service",
    ficheCaisseEmisePar: item.fichePaiementGeneratedByName,
  };

  const pdf = await renderSoumissionFicheDefinitivePdf(view);
  return { pdf, filename: `fiche-definitive-${item.numeroFicheDefinitive}.pdf` };
}
