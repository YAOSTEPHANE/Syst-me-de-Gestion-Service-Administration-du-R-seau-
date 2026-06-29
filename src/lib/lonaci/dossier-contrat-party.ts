import "server-only";

import { canReadClient, canReadConcessionnaire } from "@/lib/lonaci/access";
import { isClientStatutEligibleForContrat } from "@/lib/lonaci/client-constants";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import type { ContratDocument, DossierDocument, UserDocument } from "@/lib/lonaci/types";

export type DossierContratParty = {
  kind: "concessionnaire" | "client";
  id: string;
  displayName: string;
  codeLabel: string;
  cniNumero: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
};

export type ContratPartyRef =
  | { kind: "concessionnaire"; concessionnaireId: string }
  | { kind: "client"; lonaciClientId: string };

export function contratPartyFromDossier(dossier: DossierDocument): ContratPartyRef | null {
  const lonaciClientId = dossier.lonaciClientId?.trim();
  if (lonaciClientId) {
    return { kind: "client", lonaciClientId };
  }
  const concessionnaireId = dossier.concessionnaireId?.trim();
  if (concessionnaireId) {
    return { kind: "concessionnaire", concessionnaireId };
  }
  return null;
}

export function contratMatchesParty(contrat: ContratDocument, party: ContratPartyRef): boolean {
  if (party.kind === "client") {
    return (contrat.lonaciClientId?.trim() ?? "") === party.lonaciClientId;
  }
  return (contrat.concessionnaireId?.trim() ?? "") === party.concessionnaireId;
}

export async function loadDossierContratParty(
  dossier: DossierDocument,
): Promise<DossierContratParty | null> {
  const lonaciClientId = dossier.lonaciClientId?.trim();
  if (lonaciClientId) {
    const client = await findLonaciClientById(lonaciClientId);
    if (!client) return null;
    const displayName = (client.nomComplet || client.raisonSociale || "").trim();
    return {
      kind: "client",
      id: client.id,
      displayName,
      codeLabel: client.code,
      cniNumero: client.cniNumero,
      agenceId: client.agenceId,
      produitsAutorises: client.produitsAutorises ?? [],
    };
  }

  const concessionnaireId = dossier.concessionnaireId?.trim();
  if (!concessionnaireId) return null;
  const concessionnaire = await findConcessionnaireById(concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) return null;
  const displayName = (concessionnaire.nomComplet || concessionnaire.raisonSociale || "").trim();
  return {
    kind: "concessionnaire",
    id: concessionnaire._id ?? concessionnaireId,
    displayName,
    codeLabel: concessionnaire.codePdv ?? "",
    cniNumero: concessionnaire.cniNumero ?? null,
    agenceId: concessionnaire.agenceId ?? null,
    produitsAutorises: concessionnaire.produitsAutorises ?? [],
  };
}

export async function assertDossierPartyReadable(
  party: ContratPartyRef,
  actor: UserDocument,
): Promise<void> {
  if (party.kind === "client") {
    const client = await findLonaciClientById(party.lonaciClientId);
    if (!client || client.deletedAt) {
      throw new Error("CLIENT_NOT_FOUND");
    }
    if (!canReadClient(actor, client)) {
      throw new Error("AGENCE_FORBIDDEN");
    }
    if (!isClientStatutEligibleForContrat(client.statut)) {
      if (client.statut === "EN_ATTENTE_N1" || client.statut === "REJETE") {
        throw new Error("CLIENT_INSCRIPTION_PENDING");
      }
      throw new Error("CLIENT_BLOQUE");
    }
    return;
  }

  const concessionnaire = await findConcessionnaireById(party.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  }
  if (!canReadConcessionnaire(actor, concessionnaire)) {
    throw new Error("AGENCE_FORBIDDEN");
  }
}
