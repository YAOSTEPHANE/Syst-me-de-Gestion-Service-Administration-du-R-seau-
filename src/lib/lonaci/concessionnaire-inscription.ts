import type { ConcessionnaireInscriptionStatut } from "@/lib/lonaci/constants";
import {
  CONCESSIONNAIRE_INSCRIPTION_STATUT_LEGACY_BROUILLON,
  CONCESSIONNAIRE_INSCRIPTION_STATUTS,
} from "@/lib/lonaci/constants";
import {
  buildChecklistFromTemplate,
  computeChecklistComplet,
  mergeProductChecklistTemplates,
  parseDocumentChecklistPayload,
} from "@/lib/lonaci/produit-document-checklist";
import { findAgenceById, listProduits } from "@/lib/lonaci/referentials";
import type {
  ConcessionnaireDocument,
  DossierDocumentChecklistPayload,
  ProduitDocument,
  UserDocument,
} from "@/lib/lonaci/types";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { inscriptionTransitionRoleError } from "@/lib/lonaci/workflow-separation";
import {
  findConcessionnaireById,
  nextCodePdvForAgence,
} from "@/lib/lonaci/concessionnaires";
import { prisma } from "@/lib/prisma";

function normalizeStoredInscriptionStatut(
  value: string | null | undefined,
): ConcessionnaireInscriptionStatut | null {
  const raw = (value ?? "").trim();
  if (raw === CONCESSIONNAIRE_INSCRIPTION_STATUT_LEGACY_BROUILLON) {
    return "DOSSIER_EN_COURS";
  }
  if (isInscriptionStatut(raw)) {
    return raw;
  }
  return null;
}

export function isInscriptionStatut(value: unknown): value is ConcessionnaireInscriptionStatut {
  return (
    typeof value === "string" &&
    (CONCESSIONNAIRE_INSCRIPTION_STATUTS as readonly string[]).includes(value)
  );
}

/** Données historiques sans champ inscription : considérées comme finalisées si code PDV présent. */
export function resolveInscriptionStatut(doc: {
  inscriptionStatut?: string | null;
  codePdv?: string | null;
}): ConcessionnaireInscriptionStatut {
  const normalized = normalizeStoredInscriptionStatut(doc.inscriptionStatut);
  if (normalized) {
    return normalized;
  }
  if (doc.codePdv?.trim()) {
    return "VALIDE";
  }
  return "DOSSIER_EN_COURS";
}

export function isInscriptionDossierEditable(statut: ConcessionnaireInscriptionStatut): boolean {
  return statut === "DOSSIER_EN_COURS" || statut === "REJETE";
}

/** PDV avec code attribué en N1, en attente du paiement de la caution d'inscription. */
export function isInscriptionAwaitingCautionPayment(doc: ConcessionnaireDocument): boolean {
  return (
    resolveInscriptionStatut(doc) === "DOSSIER_EN_COURS" &&
    Boolean(doc.codePdv?.trim()) &&
    Boolean(doc.inscriptionValideN1At)
  );
}

export function isConcessionnaireInscriptionFinalisee(doc: ConcessionnaireDocument): boolean {
  return resolveInscriptionStatut(doc) === "VALIDE" && Boolean(doc.codePdv?.trim());
}

export function canUseConcessionnaireOperationnel(doc: ConcessionnaireDocument): boolean {
  if (!isConcessionnaireInscriptionFinalisee(doc)) {
    return false;
  }
  return doc.statut !== "RESILIE" && doc.statut !== "DECEDE";
}

export function buildInscriptionChecklistForProducts(
  produitCodes: string[],
  produits: ProduitDocument[],
  previous?: DossierDocumentChecklistPayload | null,
): DossierDocumentChecklistPayload {
  const template = mergeProductChecklistTemplates(produitCodes, produits);
  if (!template.length) {
    return { entries: [], complet: true };
  }
  return buildChecklistFromTemplate(template, previous?.entries ?? null);
}

export { mergeProductChecklistTemplates } from "@/lib/lonaci/produit-document-checklist";

export function formatNomComplet(nom: string, prenom: string): string {
  return `${prenom.trim()} ${nom.trim()}`.trim();
}

export interface InscriptionSubmitRequirements {
  nom: string;
  prenom: string;
  cniNumero: string;
  telephonePrincipal: string;
  gps: { lat: number; lng: number };
  produitsAutorises: string[];
  checklist: DossierDocumentChecklistPayload;
}

export function validateInscriptionSubmitRequirements(
  doc: ConcessionnaireDocument,
): { ok: true } | { ok: false; code: string; message: string } {
  const nom = (doc.nom ?? "").trim();
  const prenom = (doc.prenom ?? "").trim();
  if (nom.length < 2) {
    return { ok: false, code: "NOM_REQUIRED", message: "Le nom est obligatoire (2 caractères minimum)." };
  }
  if (prenom.length < 2) {
    return { ok: false, code: "PRENOM_REQUIRED", message: "Le prénom est obligatoire (2 caractères minimum)." };
  }
  const cni = (doc.cniNumero ?? "").trim();
  if (cni.length < 4) {
    return { ok: false, code: "CNI_REQUIRED", message: "Le numéro CNI est obligatoire pour soumettre l'inscription." };
  }
  const tel = (doc.telephonePrincipal ?? doc.telephone ?? "").trim();
  if (tel.length < 8) {
    return {
      ok: false,
      code: "TELEPHONE_REQUIRED",
      message: "Un numéro de contact principal est obligatoire pour soumettre l'inscription.",
    };
  }
  if (!doc.gps || typeof doc.gps.lat !== "number" || typeof doc.gps.lng !== "number") {
    return { ok: false, code: "GPS_REQUIRED", message: "La localisation GPS est obligatoire." };
  }
  const produits = (doc.produitsAutorises ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!produits.length) {
    return {
      ok: false,
      code: "PRODUITS_REQUIRED",
      message: "Au moins un produit doit être sélectionné.",
    };
  }
  if (!doc.agenceId) {
    return { ok: false, code: "AGENCE_REQUIRED", message: "L'agence de rattachement est obligatoire." };
  }
  const checklist = doc.documentChecklist ?? { entries: [], complet: true };
  if (checklist.entries.length > 0 && !checklist.complet) {
    return {
      ok: false,
      code: "CHECKLIST_INCOMPLETE",
      message: "Toutes les pièces obligatoires doivent être marquées comme fournies avant soumission.",
    };
  }
  const hasPhoto = doc.piecesJointes.some((p) => p.kind === "PHOTO");
  if (!hasPhoto) {
    return {
      ok: false,
      code: "PHOTO_REQUIRED",
      message: "Une photo d'identité est obligatoire avant soumission.",
    };
  }
  return { ok: true };
}

export type InscriptionTransitionAction = "SUBMIT" | "VALIDATE_N1" | "REJECT" | "RETURN_TO_DRAFT";

function canTransition(
  current: ConcessionnaireInscriptionStatut,
  target: ConcessionnaireInscriptionStatut,
  action: InscriptionTransitionAction,
  role: UserDocument["role"],
): boolean {
  if (action === "SUBMIT") {
    return (
      (current === "DOSSIER_EN_COURS" || current === "REJETE") &&
      target === "SOUMIS" &&
      ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(role)
    );
  }
  if (action === "VALIDATE_N1") {
    return (
      current === "SOUMIS" &&
      target === "DOSSIER_EN_COURS" &&
      role === "CHEF_SECTION"
    );
  }
  if (action === "REJECT") {
    return (
      current === "SOUMIS" &&
      target === "REJETE" &&
      role === "CHEF_SECTION"
    );
  }
  if (action === "RETURN_TO_DRAFT") {
    return (
      current === "REJETE" &&
      target === "DOSSIER_EN_COURS" &&
      ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"].includes(role)
    );
  }
  return false;
}

export async function transitionConcessionnaireInscription(input: {
  concessionnaireId: string;
  action: InscriptionTransitionAction;
  comment?: string | null;
  actor: UserDocument;
}): Promise<ConcessionnaireDocument> {
  const doc = await findConcessionnaireById(input.concessionnaireId);
  if (!doc || doc.deletedAt) {
    throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  }

  const current = resolveInscriptionStatut(doc);
  let target: ConcessionnaireInscriptionStatut;
  switch (input.action) {
    case "SUBMIT":
      target = "SOUMIS";
      break;
    case "VALIDATE_N1":
      target = "DOSSIER_EN_COURS";
      break;
    case "REJECT":
      target = "REJETE";
      break;
    case "RETURN_TO_DRAFT":
      target = "DOSSIER_EN_COURS";
      break;
  }

  if (!canTransition(current, target, input.action, input.actor.role)) {
    if (input.action === "VALIDATE_N1" || input.action === "REJECT") {
      throw new Error(inscriptionTransitionRoleError(input.action, input.actor.role, current));
    }
    throw new Error("FORBIDDEN_TRANSITION");
  }

  if (input.action === "SUBMIT") {
    const check = validateInscriptionSubmitRequirements(doc);
    if (!check.ok) {
      throw new Error(check.code);
    }
  }

  const now = new Date();
  const data: Record<string, unknown> = {
    inscriptionStatut: target,
    updatedByUserId: input.actor._id ?? "",
    updatedAt: now,
  };

  if (input.action === "SUBMIT") {
    data.inscriptionSoumisAt = now;
    data.inscriptionRejetMotif = null;
  }

  if (input.action === "REJECT") {
    data.inscriptionRejetMotif = input.comment?.trim() || "Rejet sans motif";
    data.inscriptionValideN1At = null;
  }

  if (input.action === "RETURN_TO_DRAFT") {
    data.inscriptionRejetMotif = null;
    data.inscriptionSoumisAt = null;
  }

  if (input.action === "VALIDATE_N1") {
    if (!doc.agenceId) {
      throw new Error("AGENCE_REQUIRED");
    }
    const agence = await findAgenceById(doc.agenceId);
    if (!agence?.code) {
      throw new Error("AGENCE_INVALID");
    }
    const codePdv = await nextCodePdvForAgence(agence.code);
    data.codePdv = codePdv;
    data.inscriptionValideN1At = now;
    data.inscriptionRejetMotif = null;
  }

  await prisma.concessionnaire.updateMany({
    where: { id: input.concessionnaireId, deletedAt: null },
    data: data as never,
  });

  const updated = await findConcessionnaireById(input.concessionnaireId);
  if (!updated) {
    throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  }

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "INSCRIPTION_TRANSITION",
    userId: input.actor._id ?? "",
    details: {
      action: input.action,
      from: current,
      to: target,
      codePdv: updated.codePdv,
      comment: input.comment ?? null,
    },
  });

  return updated;
}

export function parseConcessionnaireDocumentChecklist(
  raw: unknown,
): DossierDocumentChecklistPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.entries)) {
    return null;
  }
  return parseDocumentChecklistPayload({ documentChecklist: obj });
}

export async function refreshConcessionnaireDocumentChecklist(
  concessionnaireId: string,
  produitCodes: string[],
): Promise<DossierDocumentChecklistPayload> {
  const produits = await listProduits();
  const existing = await findConcessionnaireById(concessionnaireId);
  const previous = existing?.documentChecklist ?? null;
  return buildInscriptionChecklistForProducts(produitCodes, produits, previous);
}

export function patchDocumentChecklistStatuts(
  current: DossierDocumentChecklistPayload,
  patch: Array<{ itemId: string; statut: "FOURNI" | "MANQUANT" | "EN_ATTENTE" }>,
): DossierDocumentChecklistPayload {
  const patchMap = new Map(patch.map((p) => [p.itemId.trim(), p.statut]));
  const entries = current.entries.map((entry) => {
    const next = patchMap.get(entry.itemId);
    if (!next) return entry;
    return { ...entry, statut: next };
  });
  return { entries, complet: computeChecklistComplet(entries) };
}

/**
 * Finalise l'inscription (VALIDE + ACTIF) après paiement d'une caution d'inscription.
 * Idempotent si l'inscription est déjà finalisée.
 */
export async function completeInscriptionAfterCautionPaid(input: {
  concessionnaireId: string;
  actor?: UserDocument;
}): Promise<boolean> {
  const doc = await findConcessionnaireById(input.concessionnaireId);
  if (!doc || doc.deletedAt) {
    return false;
  }
  if (isConcessionnaireInscriptionFinalisee(doc)) {
    return false;
  }
  const current = resolveInscriptionStatut(doc);
  if (current !== "DOSSIER_EN_COURS" || !doc.codePdv?.trim() || !doc.inscriptionValideN1At) {
    return false;
  }

  const now = new Date();
  await prisma.concessionnaire.updateMany({
    where: { id: input.concessionnaireId, deletedAt: null },
    data: {
      inscriptionStatut: "VALIDE",
      statut: "ACTIF",
      updatedAt: now,
      ...(input.actor?._id ? { updatedByUserId: input.actor._id } : {}),
    },
  });

  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "INSCRIPTION_CAUTION_PAYEE",
    userId: input.actor?._id ?? "",
    details: {
      codePdv: doc.codePdv,
      from: current,
      to: "VALIDE",
    },
  });

  return true;
}

export async function resolveConcessionnaireIdFromCautionLink(caution: {
  concessionnaireId?: string | null;
  contratId?: string | null;
}): Promise<string | null> {
  const direct = (caution.concessionnaireId ?? "").trim();
  if (direct) return direct;
  const contratId = (caution.contratId ?? "").trim();
  if (!contratId) return null;
  const contrat = await prisma.contrat.findFirst({
    where: { id: contratId, deletedAt: null },
    select: { concessionnaireId: true },
  });
  return contrat?.concessionnaireId ?? null;
}
