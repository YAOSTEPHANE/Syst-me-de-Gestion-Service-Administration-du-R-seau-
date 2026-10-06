import "server-only";

import { CLIENT_TYPE_DISTRIBUTEUR_LABELS } from "@/lib/lonaci/client-constants";
import { findAgenceById } from "@/lib/lonaci/referentials";
import { soumissionFicheCaisseReference } from "@/lib/lonaci/soumission-circuit";
import { startSoumissionCircuit } from "@/lib/lonaci/soumission-circuit-service";
import { SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA } from "@/lib/lonaci/soumission-paiement-constants";
import {
  findSoumissionById,
  markSoumissionFichePaiementGenerated,
} from "@/lib/lonaci/soumissions";
import { userDisplayName, type UserDocument } from "@/lib/lonaci/types";
import type { SoumissionFichePaiementView } from "@/lib/pdf/soumission-fiche-paiement";
import { renderSoumissionFichePaiementPdf } from "@/lib/pdf/soumission-fiche-paiement";

export async function buildAndRenderSoumissionFichePaiementPdf(input: {
  soumissionId: string;
  actor: UserDocument;
}): Promise<{ pdf: Buffer; view: SoumissionFichePaiementView; filename: string }> {
  const item = await findSoumissionById(input.soumissionId, input.actor);
  if (!item) throw new Error("SOUMISSION_NOT_FOUND");

  const agentNom = userDisplayName(input.actor);
  const generatedAt = new Date().toISOString();
  const agence = await findAgenceById(item.agenceId);
  const agenceLabel = agence
    ? `${agence.code} — ${agence.libelle}`
    : item.agenceId;

  const view: SoumissionFichePaiementView = {
    reference: soumissionFicheCaisseReference(item.id),
    nomComplet: item.nomComplet,
    contact: item.contact,
    typeDistributeurLabel:
      CLIENT_TYPE_DISTRIBUTEUR_LABELS[item.typeDistributeur] ?? item.typeDistributeur,
    nombreTpe: item.nombreTpe,
    agenceLabel,
    montantFCFA: SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA,
    agentNom,
    generatedAt,
    observations: item.observations,
  };

  await markSoumissionFichePaiementGenerated({
    id: item.id,
    actor: input.actor,
    agentName: agentNom,
  });
  await startSoumissionCircuit({ id: item.id, actor: input.actor });

  const pdf = await renderSoumissionFichePaiementPdf(view);
  const filename = `fiche-paiement-caisse-${view.reference}.pdf`;
  return { pdf, view, filename };
}
