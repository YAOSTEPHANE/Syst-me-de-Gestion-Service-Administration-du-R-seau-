import "server-only";

import { findLonaciClientById } from "@/lib/lonaci/clients";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { contratPartyFromDossier } from "@/lib/lonaci/dossier-contrat-party";
import type { ConcessionnaireDocument, DossierDocument } from "@/lib/lonaci/types";
import { formatAgenceLibelle, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";
import { getDatabase } from "@/lib/mongodb";

/** Données pré-remplies du titulaire (fiche concessionnaire ou fiche client). */
export interface ContratPartySnapshot {
  nomComplet: string;
  raisonSociale: string;
  codePdv: string;
  codeTerminal: string | null;
  codeConcessionnaire: string | null;
  cniNumero: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  agenceLabel: string;
}

export async function resolveAgenceLabel(agenceId: string | null | undefined): Promise<string> {
  const id = agenceId?.trim();
  if (!id) return "Sans agence";
  const db = await getDatabase();
  const map = await loadAgenceLibelleMap(db, [id]);
  return formatAgenceLibelle(map.get(id), id);
}

export function snapshotFromConcessionnaire(
  conc: ConcessionnaireDocument,
  agenceLabel: string,
): ContratPartySnapshot {
  return {
    nomComplet: conc.nomComplet,
    raisonSociale: conc.raisonSociale,
    codePdv: conc.codePdv ?? "",
    codeTerminal: conc.codeTerminal,
    codeConcessionnaire: conc.codeConcessionnaire,
    cniNumero: conc.cniNumero,
    email: conc.email,
    telephone:
      conc.telephonePrincipal?.trim() ||
      conc.telephone?.trim() ||
      conc.telephoneSecondaire?.trim() ||
      null,
    adresse: conc.adresse,
    ville: conc.ville,
    codePostal: conc.codePostal,
    agenceLabel,
  };
}

export function snapshotFromLonaciClient(
  client: {
    code: string;
    nomComplet: string | null;
    raisonSociale: string;
    cniNumero: string | null;
    email: string | null;
    telephone: string | null;
    adresse: string | null;
    ville: string | null;
    codePostal: string | null;
  },
  agenceLabel: string,
): ContratPartySnapshot {
  return {
    nomComplet: (client.nomComplet || client.raisonSociale || "").trim(),
    raisonSociale: client.raisonSociale,
    codePdv: client.code,
    codeTerminal: null,
    codeConcessionnaire: null,
    cniNumero: client.cniNumero,
    email: client.email,
    telephone: client.telephone?.trim() || null,
    adresse: client.adresse,
    ville: client.ville,
    codePostal: client.codePostal,
    agenceLabel,
  };
}

export async function loadPartySnapshotForDossier(
  dossier: Pick<DossierDocument, "concessionnaireId" | "lonaciClientId" | "agenceId">,
): Promise<ContratPartySnapshot | null> {
  const party = contratPartyFromDossier(dossier as DossierDocument);
  if (!party) return null;

  if (party.kind === "concessionnaire") {
    const concessionnaire = await findConcessionnaireById(party.concessionnaireId);
    if (!concessionnaire || concessionnaire.deletedAt) return null;
    const agenceLabel = await resolveAgenceLabel(concessionnaire.agenceId ?? dossier.agenceId);
    return snapshotFromConcessionnaire(concessionnaire, agenceLabel);
  }

  const client = await findLonaciClientById(party.lonaciClientId);
  if (!client) return null;
  const agenceLabel = await resolveAgenceLabel(client.agenceId ?? dossier.agenceId);
  return snapshotFromLonaciClient(client, agenceLabel);
}
