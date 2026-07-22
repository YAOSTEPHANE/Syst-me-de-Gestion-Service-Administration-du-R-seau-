import "server-only";

import {
  CLIENT_CATEGORIE_LABELS,
  CLIENT_TYPE_DISTRIBUTEUR_LABELS,
  clientDisplayName,
  normalizeClientCategorie,
  normalizeClientTypeDistributeur,
} from "@/lib/lonaci/client-constants";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { contratPartyFromDossier } from "@/lib/lonaci/dossier-contrat-party";
import type { ConcessionnaireDocument, DossierDocument } from "@/lib/lonaci/types";
import { formatAgenceLibelle, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";
import { getDatabase } from "@/lib/mongodb";

/** Données pré-remplies du titulaire (fiche concessionnaire ou fiche client). */
export interface ContratPartySnapshot {
  partyKind: "client" | "concessionnaire";
  nomComplet: string;
  raisonSociale: string;
  /** Identifiant affiché : code client ou code PDV. */
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
  /** Champs spécifiques fiche client (absents pour un PDV). */
  categorie: string | null;
  categorieLabel: string | null;
  codeMachine: string | null;
  nomContact: string | null;
  typeDistributeur: string | null;
  typeDistributeurLabel: string | null;
  nombreTpm: number | null;
  numeroDistributeur: string | null;
  numeroTpm: string | null;
  notes: string | null;
  produitsAutorises: string[];
}

function emptyClientExtras(): Pick<
  ContratPartySnapshot,
  | "categorie"
  | "categorieLabel"
  | "codeMachine"
  | "nomContact"
  | "typeDistributeur"
  | "typeDistributeurLabel"
  | "nombreTpm"
  | "numeroDistributeur"
  | "numeroTpm"
  | "notes"
  | "produitsAutorises"
> {
  return {
    categorie: null,
    categorieLabel: null,
    codeMachine: null,
    nomContact: null,
    typeDistributeur: null,
    typeDistributeurLabel: null,
    nombreTpm: null,
    numeroDistributeur: null,
    numeroTpm: null,
    notes: null,
    produitsAutorises: [],
  };
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
    partyKind: "concessionnaire",
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
    ...emptyClientExtras(),
  };
}

export function snapshotFromLonaciClient(
  client: {
    code: string;
    categorie?: string | null;
    nomComplet: string | null;
    raisonSociale: string;
    codeMachine?: string | null;
    cniNumero: string | null;
    nomContact?: string | null;
    email: string | null;
    telephone: string | null;
    adresse: string | null;
    ville: string | null;
    codePostal: string | null;
    typeDistributeur?: string | null;
    nombreTpm?: number | null;
    numeroDistributeur?: string | null;
    numeroTpm?: string | null;
    notes?: string | null;
    produitsAutorises?: string[] | null;
  },
  agenceLabel: string,
): ContratPartySnapshot {
  const categorie = normalizeClientCategorie(client.categorie);
  const typeDistributeur = normalizeClientTypeDistributeur(client.typeDistributeur);
  const codeMachine = client.codeMachine?.trim() || null;
  return {
    partyKind: "client",
    nomComplet: clientDisplayName({
      categorie,
      nomComplet: client.nomComplet,
      raisonSociale: client.raisonSociale,
    }),
    raisonSociale: client.raisonSociale,
    codePdv: client.code,
    codeTerminal: codeMachine,
    codeConcessionnaire: null,
    cniNumero: client.cniNumero,
    email: client.email,
    telephone: client.telephone?.trim() || null,
    adresse: client.adresse,
    ville: client.ville,
    codePostal: client.codePostal,
    agenceLabel,
    categorie,
    categorieLabel: CLIENT_CATEGORIE_LABELS[categorie],
    codeMachine,
    nomContact: client.nomContact?.trim() || null,
    typeDistributeur,
    typeDistributeurLabel: typeDistributeur
      ? CLIENT_TYPE_DISTRIBUTEUR_LABELS[typeDistributeur]
      : null,
    nombreTpm: typeof client.nombreTpm === "number" ? client.nombreTpm : null,
    numeroDistributeur: client.numeroDistributeur?.trim() || null,
    numeroTpm: client.numeroTpm?.trim() || null,
    notes: client.notes?.trim() || null,
    produitsAutorises: Array.isArray(client.produitsAutorises)
      ? client.produitsAutorises.map((p) => String(p).trim()).filter(Boolean)
      : [],
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

/** Parse un snapshot stocké (rétrocompatible avec les payloads sans nouveaux champs). */
export function parseContratPartySnapshot(raw: unknown): ContratPartySnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  const partyKind = c.partyKind === "client" ? "client" : "concessionnaire";
  const produitsAutorises = Array.isArray(c.produitsAutorises)
    ? c.produitsAutorises.map((p) => String(p).trim()).filter(Boolean)
    : [];
  const nombreRaw = c.nombreTpm;
  const nombreTpm =
    typeof nombreRaw === "number" && Number.isFinite(nombreRaw)
      ? nombreRaw
      : typeof nombreRaw === "string" && nombreRaw.trim() && !Number.isNaN(Number(nombreRaw))
        ? Number(nombreRaw)
        : null;
  return {
    partyKind,
    nomComplet: String(c.nomComplet ?? ""),
    raisonSociale: String(c.raisonSociale ?? ""),
    codePdv: String(c.codePdv ?? ""),
    codeTerminal: c.codeTerminal != null ? String(c.codeTerminal) : null,
    codeConcessionnaire: c.codeConcessionnaire != null ? String(c.codeConcessionnaire) : null,
    cniNumero: c.cniNumero != null ? String(c.cniNumero) : null,
    email: c.email != null ? String(c.email) : null,
    telephone: c.telephone != null ? String(c.telephone) : null,
    adresse: c.adresse != null ? String(c.adresse) : null,
    ville: c.ville != null ? String(c.ville) : null,
    codePostal: c.codePostal != null ? String(c.codePostal) : null,
    agenceLabel: String(c.agenceLabel ?? ""),
    categorie: c.categorie != null ? String(c.categorie) : null,
    categorieLabel: c.categorieLabel != null ? String(c.categorieLabel) : null,
    codeMachine: c.codeMachine != null ? String(c.codeMachine) : null,
    nomContact: c.nomContact != null ? String(c.nomContact) : null,
    typeDistributeur: c.typeDistributeur != null ? String(c.typeDistributeur) : null,
    typeDistributeurLabel:
      c.typeDistributeurLabel != null ? String(c.typeDistributeurLabel) : null,
    nombreTpm,
    numeroDistributeur: c.numeroDistributeur != null ? String(c.numeroDistributeur) : null,
    numeroTpm: c.numeroTpm != null ? String(c.numeroTpm) : null,
    notes: c.notes != null ? String(c.notes) : null,
    produitsAutorises,
  };
}
