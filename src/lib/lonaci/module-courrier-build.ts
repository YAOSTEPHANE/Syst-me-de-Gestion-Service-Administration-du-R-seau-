import "server-only";

import { ObjectId } from "mongodb";

import { getCessionById } from "@/lib/lonaci/cessions";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  loadDossierContratParty,
} from "@/lib/lonaci/dossier-contrat-party";
import { findVisibleDossierById } from "@/lib/lonaci/dossiers";
import { getAgrementById } from "@/lib/lonaci/agrements";
import { findVisibleBancarisationRequestById } from "@/lib/lonaci/bancarisation";
import { getResiliationById } from "@/lib/lonaci/resiliations";
import {
  applyModuleCourrierTemplate,
  buildModuleCourrierContext,
} from "@/lib/lonaci/module-courrier-interpolation";
import { getModuleCourrierTemplate } from "@/lib/lonaci/module-courrier-settings";
import type {
  ModuleCourrierId,
  ModuleCourrierRenderView,
} from "@/lib/lonaci/module-courrier-types";
import { findAgenceById } from "@/lib/lonaci/referentials";
import { findVisibleSuccessionCaseById } from "@/lib/lonaci/succession";
import { getDemandeAttestationDomiciliationById } from "@/lib/lonaci/attestations-domiciliation";
import type { ConcessionnaireDocument, UserDocument } from "@/lib/lonaci/types";

async function agenceLabel(agenceId: string | null | undefined): Promise<string> {
  if (!agenceId?.trim()) return "—";
  const agence = await findAgenceById(agenceId.trim());
  if (!agence) return agenceId;
  return `${agence.code} — ${agence.libelle}`;
}

function splitNomComplet(nomComplet: string, nom: string | null, prenom: string | null): {
  nom: string;
  prenoms: string;
} {
  if (nom?.trim() || prenom?.trim()) {
    return { nom: nom?.trim() || "—", prenoms: prenom?.trim() || "—" };
  }
  const parts = nomComplet.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { nom: parts[0] ?? "—", prenoms: "—" };
  }
  return { nom: parts[parts.length - 1] ?? "—", prenoms: parts.slice(0, -1).join(" ") };
}

function contextFromConcessionnaire(
  conc: ConcessionnaireDocument,
  reference: string,
  generatedAt: Date,
  agence: string,
): ReturnType<typeof buildModuleCourrierContext> {
  const names = splitNomComplet(conc.nomComplet, conc.nom, conc.prenom);
  const telephone =
    conc.telephonePrincipal?.trim() || conc.telephone?.trim() || conc.telephoneSecondaire?.trim() || "";
  return buildModuleCourrierContext({
    nom: names.nom,
    prenoms: names.prenoms,
    nomComplet: conc.nomComplet?.trim() || conc.raisonSociale?.trim() || "—",
    telephone,
    email: conc.email?.trim() || "",
    codeTerminal: conc.codeTerminal?.trim() || conc.codePdv?.trim() || conc.codeConcessionnaire?.trim() || "",
    codePdv: conc.codePdv?.trim() || conc.codeTerminal?.trim() || "",
    reference,
    agence,
    ville: conc.ville?.trim() || "Abidjan",
    generatedAt,
  });
}

async function renderFromParty(input: {
  moduleId: ModuleCourrierId;
  reference: string;
  conc: ConcessionnaireDocument | null;
  partyOverride?: {
    nom?: string | null;
    prenoms?: string | null;
    nomComplet?: string | null;
    telephone?: string | null;
    email?: string | null;
    codeTerminal?: string | null;
    codePdv?: string | null;
    ville?: string | null;
  };
  fallbackNomComplet?: string | null;
  fallbackTelephone?: string | null;
  fallbackEmail?: string | null;
  agenceId?: string | null;
}): Promise<ModuleCourrierRenderView | null> {
  const generatedAt = new Date();
  const agence = await agenceLabel(input.agenceId);
  const template = await getModuleCourrierTemplate(input.moduleId);

  let context: ReturnType<typeof buildModuleCourrierContext>;
  if (input.partyOverride?.nomComplet?.trim()) {
    const names = splitNomComplet(
      input.partyOverride.nomComplet,
      input.partyOverride.nom ?? null,
      input.partyOverride.prenoms ?? null,
    );
    context = buildModuleCourrierContext({
      nom: input.partyOverride.nom?.trim() || names.nom,
      prenoms: input.partyOverride.prenoms?.trim() || names.prenoms,
      nomComplet: input.partyOverride.nomComplet.trim(),
      telephone: input.partyOverride.telephone?.trim() || "",
      email: input.partyOverride.email?.trim() || "",
      codeTerminal:
        input.partyOverride.codeTerminal?.trim() ||
        input.partyOverride.codePdv?.trim() ||
        input.conc?.codeTerminal?.trim() ||
        input.conc?.codePdv?.trim() ||
        "",
      codePdv:
        input.partyOverride.codePdv?.trim() ||
        input.conc?.codePdv?.trim() ||
        input.conc?.codeTerminal?.trim() ||
        "",
      reference: input.reference,
      agence,
      ville: input.partyOverride.ville?.trim() || input.conc?.ville?.trim() || "Abidjan",
      generatedAt,
    });
  } else if (input.conc) {
    context = contextFromConcessionnaire(input.conc, input.reference, generatedAt, agence);
  } else {
    const nomComplet = input.fallbackNomComplet?.trim() || "—";
    const names = splitNomComplet(nomComplet, null, null);
    context = buildModuleCourrierContext({
      nom: names.nom,
      prenoms: names.prenoms,
      nomComplet,
      telephone: input.fallbackTelephone?.trim() || "",
      email: input.fallbackEmail?.trim() || "",
      codeTerminal: "—",
      codePdv: "—",
      reference: input.reference,
      agence,
      ville: "Abidjan",
      generatedAt,
    });
  }

  const applied = applyModuleCourrierTemplate(template, context);
  return {
    reference: input.reference,
    generatedAt,
    expediteur: {
      nom: context.nom,
      prenoms: context.prenoms,
      contacts: context.contacts,
      codeTerminal: context.codeTerminal,
    },
    destinataire: applied.destinataire,
    objet: applied.objet,
    corps: applied.corps,
    signatureLabel: applied.signatureLabel,
    signatureName: context.nomComplet,
  };
}

export async function buildModuleCourrierForAttestation(
  id: string,
  actor: UserDocument,
): Promise<ModuleCourrierRenderView | null> {
  const row = await getDemandeAttestationDomiciliationById(id, actor);
  if (!row) return null;
  const conc = row.concessionnaireId ? await findConcessionnaireById(row.concessionnaireId) : null;
  return renderFromParty({
    moduleId: "attestation-domiciliation",
    reference: row.id,
    conc,
    agenceId: row.agenceId,
  });
}

export async function buildModuleCourrierForSuccession(
  id: string,
  actor: UserDocument,
): Promise<ModuleCourrierRenderView | null> {
  const row = await findVisibleSuccessionCaseById(id, actor);
  if (!row) return null;
  const conc = await findConcessionnaireById(row.concessionnaireId);
  const ayantNom = row.ayantDroitNom?.trim();
  if (ayantNom) {
    return renderFromParty({
      moduleId: "succession",
      reference: row.reference,
      conc,
      partyOverride: {
        nomComplet: ayantNom,
        telephone: row.ayantDroitTelephone,
        email: row.ayantDroitEmail,
        codeTerminal: conc?.codeTerminal,
        codePdv: conc?.codePdv,
        ville: conc?.ville,
      },
      agenceId: row.agenceId,
    });
  }
  return renderFromParty({
    moduleId: "succession",
    reference: row.reference,
    conc,
    agenceId: row.agenceId,
  });
}

export async function buildModuleCourrierForCession(
  id: string,
  actor: UserDocument,
): Promise<ModuleCourrierRenderView | null> {
  const row = await getCessionById(id, actor);
  if (!row || row.kind !== "CESSION") return null;
  const conc = row.cedantId ? await findConcessionnaireById(row.cedantId) : null;
  return renderFromParty({
    moduleId: "cession",
    reference: row.reference,
    conc,
    agenceId: row.oldAgenceId,
  });
}

export async function buildModuleCourrierForDelocalisation(
  id: string,
  actor: UserDocument,
): Promise<ModuleCourrierRenderView | null> {
  const row = await getCessionById(id, actor);
  if (!row || (row.kind !== "DELOCALISATION" && row.kind !== "CESSION_DELOCALISATION")) return null;
  const concId =
    row.kind === "DELOCALISATION"
      ? row.concessionnaireId
      : (row.cedantId ?? row.concessionnaireId);
  const conc = concId ? await findConcessionnaireById(concId) : null;
  return renderFromParty({
    moduleId: "delocalisation",
    reference: row.reference,
    conc,
    agenceId: row.oldAgenceId ?? row.newAgenceId,
  });
}

export async function buildModuleCourrierForResiliation(
  id: string,
  actor: UserDocument,
): Promise<ModuleCourrierRenderView | null> {
  const row = await getResiliationById(id, actor);
  if (!row) return null;
  const conc = await findConcessionnaireById(row.concessionnaireId);
  const reference = row.contratReference?.trim() || row.id;
  return renderFromParty({
    moduleId: "resiliation",
    reference,
    conc,
    agenceId: conc?.agenceId,
  });
}

export async function buildModuleCourrierForDossier(
  id: string,
  actor: UserDocument,
): Promise<ModuleCourrierRenderView | null> {
  const dossier = await findVisibleDossierById(id, actor);
  if (!dossier) return null;
  const party = await loadDossierContratParty(dossier);
  if (!party) return null;
  if (party.kind === "concessionnaire") {
    const conc = await findConcessionnaireById(party.id);
    return renderFromParty({
      moduleId: "dossier",
      reference: dossier.reference,
      conc,
      agenceId: dossier.agenceId ?? party.agenceId,
    });
  }
  return renderFromParty({
    moduleId: "dossier",
    reference: dossier.reference,
    conc: null,
    partyOverride: {
      nomComplet: party.displayName,
      codeTerminal: party.codeLabel,
      codePdv: party.codeLabel,
    },
    agenceId: dossier.agenceId ?? party.agenceId,
  });
}

export async function buildModuleCourrierForAgrement(
  id: string,
  actor: UserDocument,
): Promise<ModuleCourrierRenderView | null> {
  const row = await getAgrementById(id, actor);
  if (!row) return null;
  const conc = row.concessionnaireId ? await findConcessionnaireById(row.concessionnaireId) : null;
  return renderFromParty({
    moduleId: "agrement",
    reference: row.reference,
    conc,
    agenceId: row.agenceId,
  });
}

export async function buildModuleCourrierForBancarisation(
  id: string,
  actor: UserDocument,
): Promise<ModuleCourrierRenderView | null> {
  const row = await findVisibleBancarisationRequestById(id, actor);
  if (!row) return null;
  const conc = await findConcessionnaireById(row.concessionnaireId);
  return renderFromParty({
    moduleId: "bancarisation",
    reference: row._id ?? id,
    conc,
    agenceId: row.agenceId,
  });
}

export async function buildModuleCourrierView(
  moduleId: ModuleCourrierId,
  dossierId: string,
  actor: UserDocument,
): Promise<ModuleCourrierRenderView | null> {
  if (!ObjectId.isValid(dossierId)) return null;
  switch (moduleId) {
    case "attestation-domiciliation":
      return buildModuleCourrierForAttestation(dossierId, actor);
    case "succession":
      return buildModuleCourrierForSuccession(dossierId, actor);
    case "cession":
      return buildModuleCourrierForCession(dossierId, actor);
    case "delocalisation":
      return buildModuleCourrierForDelocalisation(dossierId, actor);
    case "resiliation":
      return buildModuleCourrierForResiliation(dossierId, actor);
    case "dossier":
      return buildModuleCourrierForDossier(dossierId, actor);
    case "agrement":
      return buildModuleCourrierForAgrement(dossierId, actor);
    case "bancarisation":
      return buildModuleCourrierForBancarisation(dossierId, actor);
    default:
      return null;
  }
}
