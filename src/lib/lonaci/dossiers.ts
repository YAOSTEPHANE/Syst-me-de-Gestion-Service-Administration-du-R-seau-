import { ObjectId } from "mongodb";

import type { LonaciRole } from "@/lib/lonaci/constants";
import type {
  DossierDocument,
  DossierValidationStep,
  DossierStatus,
  DossierType,
  UserDocument,
} from "@/lib/lonaci/types";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { broadcastCriticalEmailToRole, sendCriticalEmailToUserId } from "@/lib/lonaci/critical-email";
import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { hasActiveContractForProduct } from "@/lib/lonaci/contracts";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { notifyRoleTargets, sendNotification } from "@/lib/lonaci/notifications";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";
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
    { key: { deletedAt: 1 }, name: "idx_deleted" },
  ]);
}

export interface CreateDossierInput {
  type: DossierType;
  concessionnaireId: string;
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
}

export async function createDossier(input: CreateDossierInput): Promise<DossierDocument> {
  const concessionnaire = await findConcessionnaireById(input.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  }
  if (!canReadConcessionnaire(input.actor, concessionnaire)) {
    throw new Error("AGENCE_FORBIDDEN");
  }
  // Règles métier : un contrat ne peut être créé que si le concessionnaire est ACTIF.
  if (concessionnaire.statut !== "ACTIF") {
    throw new Error("CONCESSIONNAIRE_BLOQUE");
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
      const exists = await hasActiveContractForProduct(concessionnaire._id ?? "", produitCode);
      if (exists) {
        throw new Error("ACTIVE_CONTRACT_EXISTS");
      }
    }
  }

  const db = await getDatabase();
  const now = new Date();
  const reference = await nextDossierReference();
  const initialStatus = input.initialStatus ?? "BROUILLON";
  const doc: InsertDossier = {
    type: input.type,
    reference,
    status: initialStatus,
    concessionnaireId: input.concessionnaireId,
    agenceId: concessionnaire.agenceId,
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
      return role === "CHEF_SECTION" || role === "ASSIST_CDS" || role === "CHEF_SERVICE";
    case "VALIDE_N2":
      return role === "ASSIST_CDS" || role === "CHEF_SERVICE";
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

async function notifyAfterTransition(dossier: DossierDocument, target: DossierStatus, actor: UserDocument) {
  const metadata = { dossierId: dossier._id, dossierReference: dossier.reference, status: target };
  if (target === "SOUMIS") {
    await notifyRoleTargets(
      "CHEF_SECTION",
      `Dossier ${dossier.reference} soumis`,
      "Un dossier attend une validation N1.",
      metadata,
    );
    await broadcastCriticalEmailToRole(
      "CHEF_SECTION",
      `Dossier ${dossier.reference} soumis`,
      "Un dossier attend une validation N1. Connectez-vous a la console.",
    );
  } else if (target === "VALIDE_N1") {
    await notifyRoleTargets(
      "ASSIST_CDS",
      `Dossier ${dossier.reference} valide N1`,
      "Un dossier attend une validation N2.",
      metadata,
    );
    await broadcastCriticalEmailToRole(
      "ASSIST_CDS",
      `Dossier ${dossier.reference} valide N1`,
      "Un dossier attend une validation N2.",
    );
  } else if (target === "VALIDE_N2") {
    await notifyRoleTargets(
      "CHEF_SERVICE",
      `Dossier ${dossier.reference} valide N2`,
      "Un dossier attend la finalisation.",
      metadata,
    );
    await broadcastCriticalEmailToRole(
      "CHEF_SERVICE",
      `Dossier ${dossier.reference} valide N2`,
      "Un dossier attend la finalisation.",
    );
  } else if (target === "FINALISE") {
    await sendNotification({
      userId: dossier.createdByUserId,
      title: `Dossier ${dossier.reference} finalise`,
      message: "Le dossier a ete finalise.",
      metadata,
      channel: "IN_APP",
    });
    await sendNotification({
      userId: dossier.createdByUserId,
      title: `Dossier ${dossier.reference} finalise`,
      message: "Le dossier a ete finalise.",
      metadata,
      channel: "EMAIL",
    });
    await sendCriticalEmailToUserId(
      dossier.createdByUserId,
      `Dossier ${dossier.reference} finalise`,
      "Le dossier a ete finalise. Consultez la console pour le detail.",
    );
  } else if (target === "BROUILLON") {
    await sendNotification({
      userId: dossier.createdByUserId,
      title: `Dossier ${dossier.reference} renvoye en brouillon`,
      message: "Le dossier a ete rejete et renvoye en brouillon.",
      metadata,
      channel: "IN_APP",
    });
    await sendCriticalEmailToUserId(
      dossier.createdByUserId,
      `Dossier ${dossier.reference} renvoye en brouillon`,
      "Votre dossier a ete rejete et renvoye en brouillon. Verifiez les commentaires dans la console.",
    );
  } else if (target === "REJETE") {
    await sendNotification({
      userId: dossier.createdByUserId,
      title: `Dossier ${dossier.reference} rejete`,
      message: "Le dossier a ete rejete avec motif.",
      metadata,
      channel: "IN_APP",
    });
    await sendCriticalEmailToUserId(
      dossier.createdByUserId,
      `Dossier ${dossier.reference} rejete`,
      "Votre dossier a ete rejete. Consultez les commentaires pour correction.",
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

  const concessionnaire = await findConcessionnaireById(dossier.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  }
  if (!canReadConcessionnaire(actor, concessionnaire)) {
    throw new Error("AGENCE_FORBIDDEN");
  }

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

  await notifyAfterTransition(updated, targetStatus, actor);
  return updated;
}

export async function listDossiers(
  page: number,
  pageSize: number,
  status: DossierStatus | undefined,
  type: DossierType | undefined,
  scopeAgenceId: string | null | undefined,
) {
  const db = await getDatabase();
  const filter: Record<string, unknown> = { deletedAt: null };
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (scopeAgenceId) filter.agenceId = scopeAgenceId;
  const skip = (page - 1) * pageSize;
  const col = db.collection<StoredDossier>(COLLECTION);
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  return {
    items: rows.map((row) => ({
      id: row._id.toHexString(),
      type: row.type,
      reference: row.reference,
      status: row.status,
      concessionnaireId: row.concessionnaireId,
      agenceId: row.agenceId,
      payload: row.payload,
      history: row.history.map((h) => ({
        ...h,
        actedAt: h.actedAt.toISOString(),
      })),
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}
