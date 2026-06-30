import { ObjectId } from "mongodb";

import { appendAuditLog } from "@/lib/lonaci/audit";
import type { LonaciRole } from "@/lib/lonaci/constants";
import type {
  DossierDocument,
  DossierDocumentChecklistStatut,
  DossierValidationStep,
  DossierStatus,
  DossierType,
  UserDocument,
} from "@/lib/lonaci/types";
import { userDisplayName } from "@/lib/lonaci/types";
import { formatDossierOperationLabel } from "@/lib/lonaci/dossier-labels";
import { broadcastCriticalEmailToRole, sendCriticalEmailToUserId } from "@/lib/lonaci/critical-email";
import { dossierEligibleDechargeDefinitive } from "@/lib/lonaci/dossier-decharge-constants";
import {
  ensureChecklistForDossierProduits,
  getDossierProduitCodes,
  resolveDossierCautionsStatus,
  serializeDossierProduitPayload,
} from "@/lib/lonaci/dossier-produits";
import { parseContratGenerePayload } from "@/lib/lonaci/contrat-document";
import {
  contratPartyFromDossier,
  contratMatchesParty,
  loadDossierContratParty,
  assertDossierPartyReadable,
  type ContratPartyRef,
} from "@/lib/lonaci/dossier-contrat-party";
import { findContratById, hasActiveContractForParty } from "@/lib/lonaci/contracts";
import { produitAutorisePourConcessionnaire } from "@/lib/lonaci/contrat-produit-rules";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { isClientStatutEligibleForContrat } from "@/lib/lonaci/client-constants";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import { notifyRoleTargets, sendNotification } from "@/lib/lonaci/notifications";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";
import {
  contratStatutMetierFields,
  resolveContratStatutMetier,
} from "@/lib/lonaci/contrat-statut-metier";
import {
  parseDocumentChecklistPayload,
  mergeChecklistStatutPatch,
  serializeDocumentChecklistPayload,
} from "@/lib/lonaci/produit-document-checklist";
import {
  restrictionToMongoAgenceFilter,
  type ListAgenceRestriction,
} from "@/lib/lonaci/list-agence-restriction";
import { getDatabase } from "@/lib/mongodb";

const COLLECTION = "dossiers";
const COUNTERS = "counters";
const REF_COUNTER_ID = "dossier_ref";

type StoredDossier = Omit<DossierDocument, "_id"> & { _id: ObjectId };
type InsertDossier = Omit<StoredDossier, "_id">;

function mapDossier(row: StoredDossier): DossierDocument {
  return {
    ...row,
    _id: row._id.toHexString(),
  };
}

async function nextDossierReference() {
  const db = await getDatabase();
  await db.collection<{ _id: string; seq: number }>(COUNTERS).updateOne(
    { _id: REF_COUNTER_ID },
    { $inc: { seq: 1 } },
    { upsert: true },
  );
  const counter = await db.collection<{ _id: string; seq: number }>(COUNTERS).findOne({ _id: REF_COUNTER_ID });
  const seq = counter?.seq ?? 1;
  return `DOS-${String(seq).padStart(8, "0")}`;
}

export async function ensureDossierIndexes() {
  const db = await getDatabase();
  await db.collection<StoredDossier>(COLLECTION).createIndexes([
    { key: { reference: 1 }, unique: true, name: "uniq_reference" },
    { key: { type: 1, status: 1 }, name: "idx_type_status" },
    { key: { concessionnaireId: 1, updatedAt: -1 }, name: "idx_concessionnaire_updated" },
    { key: { lonaciClientId: 1, updatedAt: -1 }, name: "idx_lonaci_client_updated" },
    { key: { deletedAt: 1 }, name: "idx_deleted" },
  ]);
}

export interface CreateDossierInput {
  type: DossierType;
  concessionnaireId?: string | null;
  lonaciClientId?: string | null;
  payload: Record<string, unknown>;
  actor: UserDocument;
  /**
   * Statut initial optionnel.
   * Utile pour des créations "admin" qui doivent être considérées validées automatiquement.
   */
  initialStatus?: DossierStatus;
  /**
   * Historique initial optionnel (ex: une étape FINALISE auto-validée).
   * Par défaut: [].
   */
  initialHistory?: DossierValidationStep[];
  /** Statuts checklist documents (dossier contrat à la création). */
  documentChecklist?: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>;
}

export async function createDossier(input: CreateDossierInput): Promise<DossierDocument> {
  const lonaciClientId = input.lonaciClientId?.trim() || null;
  const concessionnaireId = input.concessionnaireId?.trim() || null;
  if (!lonaciClientId && !concessionnaireId) {
    throw new Error("PARTY_REQUIRED");
  }
  if (lonaciClientId && concessionnaireId) {
    throw new Error("PARTY_AMBIGUOUS");
  }
  if (concessionnaireId) {
    throw new Error("DOSSIER_CLIENT_REQUIRED");
  }

  let agenceId: string | null = null;
  let party: ContratPartyRef;
  if (lonaciClientId) {
    party = { kind: "client", lonaciClientId };
    await assertDossierPartyReadable(party, input.actor);
    const client = await findLonaciClientById(lonaciClientId);
    if (!client) {
      throw new Error("CLIENT_NOT_FOUND");
    }
    if (!isClientStatutEligibleForContrat(client.statut)) {
      if (client.statut === "EN_ATTENTE_N1" || client.statut === "REJETE") {
        throw new Error("CLIENT_INSCRIPTION_PENDING");
      }
      throw new Error("CLIENT_BLOQUE");
    }
    agenceId = client.agenceId ?? null;
  } else {
    throw new Error("PARTY_REQUIRED");
  }

  if (input.type === "CONTRAT_ACTUALISATION") {
    const produitCode = String(input.payload.produitCode ?? "").trim().toUpperCase();
    const operationType = String(input.payload.operationType ?? "");
    if (!produitCode) {
      throw new Error("PRODUIT_REQUIRED");
    }
    const produit = await resolveProduitForContratWorkflow(produitCode);
    if (!produit) {
      throw new Error("PRODUIT_INVALID");
    }
    if (operationType === "NOUVEAU") {
      const exists = await hasActiveContractForParty(party, produitCode);
      if (exists) {
        throw new Error("ACTIVE_CONTRACT_EXISTS");
      }
    }
    const partyProduits = (await findLonaciClientById(party.lonaciClientId))?.produitsAutorises ?? [];
    if (!produitAutorisePourConcessionnaire(partyProduits, produitCode)) {
      throw new Error("PRODUIT_NOT_ALLOWED");
    }
    const produitCodes = [produitCode];
    const checklist = await ensureChecklistForDossierProduits(input.payload, produitCodes);
    const mergedChecklist = input.documentChecklist?.length
      ? mergeChecklistStatutPatch(checklist, input.documentChecklist)
      : checklist;
    input.payload = {
      ...input.payload,
      ...serializeDossierProduitPayload(produitCodes),
      ...serializeDocumentChecklistPayload(mergedChecklist),
    };
  }

  const db = await getDatabase();
  const now = new Date();
  const reference = await nextDossierReference();
  const initialStatus = input.initialStatus ?? "BROUILLON";
  const doc: InsertDossier = {
    type: input.type,
    reference,
    status: initialStatus,
    concessionnaireId: null,
    lonaciClientId,
    agenceId,
    payload: input.payload,
    history: input.initialHistory ?? [],
    createdByUserId: input.actor._id ?? "",
    updatedByUserId: input.actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const result = await db.collection<InsertDossier>(COLLECTION).insertOne(doc);
  const created: StoredDossier = { ...doc, _id: result.insertedId };

  await appendAuditLog({
    entityType: "DOSSIER",
    entityId: result.insertedId.toHexString(),
    action: "CREATE",
    userId: input.actor._id ?? "",
    details: { type: doc.type, reference: doc.reference },
  });

  return mapDossier(created);
}

export async function findDossierById(id: string): Promise<DossierDocument | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  const db = await getDatabase();
  const row = await db.collection<StoredDossier>(COLLECTION).findOne({ _id: new ObjectId(id) });
  return row ? mapDossier(row) : null;
}

function roleCanDoTransition(role: LonaciRole, target: DossierStatus): boolean {
  switch (target) {
    case "SOUMIS":
      return role === "AGENT" || role === "CHEF_SECTION" || role === "ASSIST_CDS" || role === "CHEF_SERVICE";
    case "VALIDE_N1":
      return role === "CHEF_SECTION";
    case "VALIDE_N2":
      return role === "ASSIST_CDS";
    case "FINALISE":
      return role === "CHEF_SERVICE";
    case "BROUILLON":
      return role === "CHEF_SECTION" || role === "ASSIST_CDS" || role === "CHEF_SERVICE";
    case "REJETE":
      return role === "CHEF_SECTION" || role === "ASSIST_CDS" || role === "CHEF_SERVICE";
    default:
      return false;
  }
}

function canTransition(current: DossierStatus, target: DossierStatus): boolean {
  if (current === "BROUILLON" && target === "SOUMIS") return true;
  if (current === "REJETE" && target === "SOUMIS") return true;
  if (current === "SOUMIS" && (target === "VALIDE_N1" || target === "BROUILLON" || target === "REJETE")) return true;
  // Règles métier : en cas de rejet, le dossier revient au brouillon.
  if (current === "VALIDE_N1" && (target === "VALIDE_N2" || target === "SOUMIS" || target === "BROUILLON" || target === "REJETE")) return true;
  if (current === "VALIDE_N2" && (target === "FINALISE" || target === "VALIDE_N1" || target === "BROUILLON" || target === "REJETE")) return true;
  return false;
}

async function notifyAfterTransition(
  dossier: DossierDocument,
  target: DossierStatus,
  actor: UserDocument,
  comment: string | null,
) {
  const metadata = { dossierId: dossier._id, dossierReference: dossier.reference, status: target };
  const operationLabel = formatDossierOperationLabel(dossier.type, dossier.payload);
  const actionBy = userDisplayName(actor);
  if (target === "SOUMIS") {
    await notifyRoleTargets(
      "CHEF_SECTION",
      `Dossier ${dossier.reference} soumis`,
      `Opération ${operationLabel} | référence ${dossier.reference} | action validation N1 attendue | acteur ${actionBy}.`,
      metadata,
    );
    await broadcastCriticalEmailToRole(
      "CHEF_SECTION",
      `Dossier ${dossier.reference} soumis`,
      `Opération ${operationLabel} | référence ${dossier.reference} | action validation N1 attendue | acteur ${actionBy}. Connectez-vous à la console.`,
    );
  } else if (target === "VALIDE_N1") {
    await notifyRoleTargets(
      "ASSIST_CDS",
      `Dossier ${dossier.reference} valide N1`,
      `Opération ${operationLabel} | référence ${dossier.reference} | action validation N2 attendue | acteur ${actionBy}.`,
      metadata,
    );
    await broadcastCriticalEmailToRole(
      "ASSIST_CDS",
      `Dossier ${dossier.reference} valide N1`,
      `Opération ${operationLabel} | référence ${dossier.reference} | action validation N2 attendue | acteur ${actionBy}.`,
    );
  } else if (target === "VALIDE_N2") {
    await notifyRoleTargets(
      "CHEF_SERVICE",
      `Dossier ${dossier.reference} valide N2`,
      `Opération ${operationLabel} | référence ${dossier.reference} | action finalisation attendue | acteur ${actionBy}.`,
      metadata,
    );
    await broadcastCriticalEmailToRole(
      "CHEF_SERVICE",
      `Dossier ${dossier.reference} valide N2`,
      `Opération ${operationLabel} | référence ${dossier.reference} | action finalisation attendue | acteur ${actionBy}.`,
    );
  } else if (target === "FINALISE") {
    await sendNotification({
      userId: dossier.createdByUserId,
      title: `Dossier ${dossier.reference} finalise`,
      message: `Opération ${operationLabel} | référence ${dossier.reference} | action dossier finalisé | acteur ${actionBy}.`,
      metadata,
      channel: "IN_APP",
    });
    await sendNotification({
      userId: dossier.createdByUserId,
      title: `Dossier ${dossier.reference} finalise`,
      message: `Opération ${operationLabel} | référence ${dossier.reference} | action dossier finalisé | acteur ${actionBy}.`,
      metadata,
      channel: "EMAIL",
    });
    await sendCriticalEmailToUserId(
      dossier.createdByUserId,
      `Dossier ${dossier.reference} finalise`,
      "Le dossier a ete finalise. Consultez la console pour le detail.",
    );
  } else if (target === "BROUILLON") {
    const reasonSuffix = comment?.trim() ? ` | motif ${comment.trim()}` : "";
    await sendNotification({
      userId: dossier.createdByUserId,
      title: `Dossier ${dossier.reference} renvoye en brouillon`,
      message: `Opération ${operationLabel} | référence ${dossier.reference} | action dossier renvoyé en brouillon | acteur ${actionBy}.${reasonSuffix}`,
      metadata,
      channel: "IN_APP",
    });
    await sendCriticalEmailToUserId(
      dossier.createdByUserId,
      `Dossier ${dossier.reference} renvoye en brouillon`,
      `Opération ${operationLabel} | référence ${dossier.reference} | action dossier renvoyé en brouillon | acteur ${actionBy}.${reasonSuffix} Vérifiez les commentaires dans la console.`,
    );
  } else if (target === "REJETE") {
    const reasonSuffix = comment?.trim() ? ` | motif ${comment.trim()}` : "";
    await sendNotification({
      userId: dossier.createdByUserId,
      title: `Dossier ${dossier.reference} rejete`,
      message: `Opération ${operationLabel} | référence ${dossier.reference} | action dossier rejeté | acteur ${actionBy}.${reasonSuffix}`,
      metadata,
      channel: "IN_APP",
    });
    await sendCriticalEmailToUserId(
      dossier.createdByUserId,
      `Dossier ${dossier.reference} rejete`,
      `Opération ${operationLabel} | référence ${dossier.reference} | action dossier rejeté | acteur ${actionBy}.${reasonSuffix} Consultez les commentaires pour correction.`,
    );
  }

  await appendAuditLog({
    entityType: "DOSSIER",
    entityId: dossier._id ?? "",
    action: `TRANSITION_${target}`,
    userId: actor._id ?? "",
    details: { targetStatus: target },
  });
}

/** Champs statut métier 3.5 pour un dossier contrat (API détail / liste). */
export async function buildDossierContratStatutMetierFields(
  dossier: Pick<DossierDocument, "type" | "status" | "concessionnaireId" | "lonaciClientId" | "payload">,
) {
  if (dossier.type !== "CONTRAT_ACTUALISATION") {
    return {};
  }
  const checklist = parseDocumentChecklistPayload(dossier.payload ?? {});
  const hasDocumentChecklist = Boolean(checklist?.entries.length);
  const produitCodes = getDossierProduitCodes(dossier.payload ?? {});
  const cautionsStatus = await resolveDossierCautionsStatus(dossier);
  const cautionPaid = cautionsStatus.allPaid;
  const cautionPaymentReference = cautionsStatus.primaryPaymentReference;
  let dechargeDefinitiveEligible = false;
  if (produitCodes.length) {
    dechargeDefinitiveEligible = dossierEligibleDechargeDefinitive(
      hasDocumentChecklist ? checklist! : { entries: [], complet: false },
      cautionPaid,
      Boolean(cautionPaymentReference),
    );
  }
  const statutMetier = resolveContratStatutMetier({
    dossierStatus: dossier.status,
    checklistComplet: hasDocumentChecklist ? checklist!.complet : null,
    cautionPaid,
    hasDocumentChecklist,
  });
  return {
    hasDocumentChecklist,
    checklistComplet: hasDocumentChecklist ? checklist!.complet : null,
    cautionPaid,
    cautionPaymentReference,
    produitCodes,
    cautionsByProduit: cautionsStatus.links.map((l) => ({
      produitCode: l.produitCode,
      cautionPaid: l.status === "PAYEE" && Boolean(l.paymentReference),
      paymentReference: l.paymentReference,
      referenceLabel: l.referenceLabel,
    })),
    dechargeDefinitiveEligible,
    hasContratGenere: Boolean(parseContratGenerePayload(dossier.payload ?? {})),
    contratArchive: Boolean(parseContratGenerePayload(dossier.payload ?? {})?.contratSigneArchive),
    ...contratStatutMetierFields(statutMetier),
  };
}

/** Bloque la soumission si la checklist documents du produit n’est pas entièrement « Fourni ». */
export async function assertDossierContratSubmitAllowed(dossier: DossierDocument): Promise<void> {
  if (dossier.type !== "CONTRAT_ACTUALISATION") return;
  const produitCodes = getDossierProduitCodes(dossier.payload ?? {});
  if (!produitCodes.length) return;
  const checklist = await ensureChecklistForDossierProduits(dossier.payload ?? {}, produitCodes);
  if (checklist.entries.length > 0 && !checklist.complet) {
    throw new Error("DOSSIER_CHECKLIST_INCOMPLETE");
  }
}

export async function transitionDossier(
  dossierId: string,
  targetStatus: DossierStatus,
  actor: UserDocument,
  comment: string | null,
): Promise<DossierDocument> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt) {
    throw new Error("DOSSIER_NOT_FOUND");
  }
  if (!roleCanDoTransition(actor.role, targetStatus)) {
    throw new Error("ROLE_FORBIDDEN");
  }
  if (!canTransition(dossier.status, targetStatus)) {
    throw new Error("INVALID_TRANSITION");
  }
  if (targetStatus === "SOUMIS") {
    await assertDossierContratSubmitAllowed(dossier);
  }

  const party = contratPartyFromDossier(dossier);
  if (!party) {
    throw new Error("PARTY_REQUIRED");
  }
  await assertDossierPartyReadable(party, actor);

  const db = await getDatabase();
  const step = {
    status: targetStatus,
    actedByUserId: actor._id ?? "",
    actedAt: new Date(),
    comment,
  };
  const now = new Date();

  const result = await db.collection<StoredDossier>(COLLECTION).updateOne(
    { _id: new ObjectId(dossierId), deletedAt: null },
    {
      $set: {
        status: targetStatus,
        updatedAt: now,
        updatedByUserId: actor._id ?? "",
      },
      $push: { history: step },
    },
  );
  if (result.matchedCount === 0) {
    throw new Error("DOSSIER_NOT_FOUND");
  }

  const updated = await findDossierById(dossierId);
  if (!updated) {
    throw new Error("DOSSIER_NOT_FOUND");
  }

  await notifyAfterTransition(updated, targetStatus, actor, comment);
  return updated;
}

/** Champs modifiables sur un dossier contrat en brouillon / rejeté (correction avant resoumission). */
export type DossierContratPayloadPatch = {
  observations?: string | null;
  commentaire?: string | null;
  dateEffet?: string;
  parentContratId?: string | null;
  agenceId?: string;
  produitCode?: string;
  operationType?: "NOUVEAU" | "ACTUALISATION";
  documentChecklist?: Array<{ itemId: string; statut: DossierDocumentChecklistStatut }>;
};

export async function patchContratDossierPayload(
  dossierId: string,
  patch: DossierContratPayloadPatch,
  actor: UserDocument,
): Promise<DossierDocument> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt) {
    throw new Error("DOSSIER_NOT_FOUND");
  }
  if (dossier.type !== "CONTRAT_ACTUALISATION") {
    throw new Error("DOSSIER_TYPE_UNSUPPORTED");
  }
  if (dossier.status !== "BROUILLON" && dossier.status !== "REJETE") {
    throw new Error("DOSSIER_NOT_EDITABLE");
  }

  const patchKeys = (Object.keys(patch) as (keyof DossierContratPayloadPatch)[]).filter(
    (k) => patch[k] !== undefined,
  );
  if (patchKeys.length === 0) {
    throw new Error("PATCH_EMPTY");
  }

  const party = contratPartyFromDossier(dossier);
  if (!party) {
    throw new Error("PARTY_REQUIRED");
  }
  await assertDossierPartyReadable(party, actor);
  const partyProfile = await loadDossierContratParty(dossier);
  if (!partyProfile) {
    throw new Error("PARTY_NOT_FOUND");
  }

  const current = { ...(dossier.payload ?? {}) } as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };

  if (patch.observations !== undefined) {
    next.observations = patch.observations;
  }
  if (patch.commentaire !== undefined) {
    next.commentaire = patch.commentaire;
  }
  if (patch.produitCode !== undefined) {
    const code = String(patch.produitCode).trim().toUpperCase();
    next.produitCode = code;
    next.produitCodes = [code];
  }
  if (patch.operationType !== undefined) {
    next.operationType = patch.operationType;
  }
  if (patch.parentContratId !== undefined) {
    const raw = patch.parentContratId;
    next.parentContratId = raw && String(raw).trim() ? String(raw).trim() : null;
  }
  if (patch.dateEffet !== undefined) {
    const d = new Date(patch.dateEffet);
    if (Number.isNaN(d.getTime())) {
      throw new Error("DATE_EFFET_INVALID");
    }
    const iso = d.toISOString();
    next.dateEffet = iso;
    next.dateOperation = iso;
  }

  let nextAgenceId = dossier.agenceId ?? null;
  if (patch.agenceId !== undefined) {
    if (!partyProfile.agenceId || patch.agenceId.trim() !== partyProfile.agenceId) {
      throw new Error("AGENCE_INVALID");
    }
    next.agenceId = patch.agenceId.trim();
    nextAgenceId = patch.agenceId.trim();
  }

  const op = String(next.operationType ?? "");
  const produitCodes = getDossierProduitCodes(next);
  const produitCode = produitCodes[0] ?? "";
  if (!produitCode) {
    throw new Error("PRODUIT_REQUIRED");
  }
  const produit = await resolveProduitForContratWorkflow(produitCode);
  if (!produit) {
    throw new Error("PRODUIT_INVALID");
  }
  for (const pcode of produitCodes) {
    if (!produitAutorisePourConcessionnaire(partyProfile.produitsAutorises ?? [], pcode)) {
      throw new Error("PRODUIT_NOT_ALLOWED");
    }
  }

  if (op === "NOUVEAU") {
    next.parentContratId = null;
    for (const pcode of produitCodes) {
      const exists = await hasActiveContractForParty(party, pcode);
      if (exists) {
        throw new Error("ACTIVE_CONTRACT_EXISTS");
      }
    }
  } else if (op === "ACTUALISATION") {
    const pid = String(next.parentContratId ?? "").trim();
    if (!pid) {
      throw new Error("PARENT_CONTRAT_REQUIRED");
    }
    const parent = await findContratById(pid);
    if (
      !parent ||
      parent.status !== "ACTIF" ||
      !contratMatchesParty(parent, party) ||
      parent.produitCode.trim().toUpperCase() !== produitCode
    ) {
      throw new Error("PARENT_CONTRAT_INVALID");
    }
  } else {
    throw new Error("OPERATION_TYPE_INVALID");
  }

  Object.assign(next, serializeDossierProduitPayload(produitCodes));
  let checklist = await ensureChecklistForDossierProduits(next, produitCodes);
  if (patch.documentChecklist !== undefined) {
    checklist = mergeChecklistStatutPatch(checklist, patch.documentChecklist);
  }
  Object.assign(next, serializeDocumentChecklistPayload(checklist));

  const db = await getDatabase();
  const now = new Date();
  const result = await db.collection<StoredDossier>(COLLECTION).updateOne(
    { _id: new ObjectId(dossierId), deletedAt: null },
    {
      $set: {
        payload: next,
        agenceId: nextAgenceId,
        updatedAt: now,
        updatedByUserId: actor._id ?? "",
      },
    },
  );
  if (result.matchedCount === 0) {
    throw new Error("DOSSIER_NOT_FOUND");
  }

  const updated = await findDossierById(dossierId);
  if (!updated) {
    throw new Error("DOSSIER_NOT_FOUND");
  }

  await appendAuditLog({
    entityType: "DOSSIER",
    entityId: dossierId,
    action: "UPDATE_PAYLOAD",
    userId: actor._id ?? "",
    details: { keys: patchKeys },
  });

  return updated;
}

export async function listDossiers(
  page: number,
  pageSize: number,
  status: DossierStatus | undefined,
  type: DossierType | undefined,
  agenceRestriction: ListAgenceRestriction,
  q?: string,
  concessionnaireId?: string,
  sortField: "updatedAt" | "reference" | "status" = "updatedAt",
  sortOrder: "asc" | "desc" = "desc",
) {
  const db = await getDatabase();
  const filter: Record<string, unknown> = { deletedAt: null };
  if (status) filter.status = status;
  if (type) filter.type = type;
  const agenceMongo = restrictionToMongoAgenceFilter(agenceRestriction);
  if (agenceMongo) filter.agenceId = agenceMongo;
  if (concessionnaireId?.trim()) filter.concessionnaireId = concessionnaireId.trim();
  if (q?.trim()) {
    const escaped = q
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    filter.$or = [{ reference: regex }, { status: regex }, { type: regex }, { concessionnaireId: regex }];
  }
  const skip = (page - 1) * pageSize;
  const col = db.collection<StoredDossier>(COLLECTION);
  const sort: Record<string, 1 | -1> = {
    [sortField]: sortOrder === "asc" ? 1 : -1,
  };
  if (sortField !== "updatedAt") {
    sort.updatedAt = -1;
  }
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort(sort).skip(skip).limit(pageSize).toArray(),
  ]);

  const cautionPaidByDossierId = new Map<string, boolean>();
  await Promise.all(
    rows
      .filter((row) => row.type === "CONTRAT_ACTUALISATION")
      .map(async (row) => {
        const dossierId = row._id.toHexString();
        const mapped = mapDossier(row);
        const status = await resolveDossierCautionsStatus(mapped);
        cautionPaidByDossierId.set(dossierId, status.allPaid);
      }),
  );

  return {
    items: rows.map((row) => {
      const checklist =
        row.type === "CONTRAT_ACTUALISATION"
          ? parseDocumentChecklistPayload(row.payload ?? {})
          : null;
      const hasDocumentChecklist = Boolean(checklist?.entries.length);
      const id = row._id.toHexString();
      const base = {
        id,
        type: row.type,
        reference: row.reference,
        status: row.status,
        concessionnaireId: row.concessionnaireId,
        lonaciClientId: row.lonaciClientId ?? null,
        agenceId: row.agenceId,
        payload: row.payload,
        hasDocumentChecklist,
        checklistComplet: hasDocumentChecklist ? checklist!.complet : null,
        history: (row.history ?? []).map((h) => ({
          ...h,
          actedAt: h.actedAt.toISOString(),
        })),
        createdByUserId: row.createdByUserId,
        updatedByUserId: row.updatedByUserId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
      if (row.type !== "CONTRAT_ACTUALISATION") {
        return base;
      }
      const statutMetier = resolveContratStatutMetier({
        dossierStatus: row.status,
        checklistComplet: base.checklistComplet,
        cautionPaid: cautionPaidByDossierId.get(id) ?? false,
        hasDocumentChecklist,
      });
      return { ...base, ...contratStatutMetierFields(statutMetier) };
    }),
    total,
    page,
    pageSize,
  };
}
