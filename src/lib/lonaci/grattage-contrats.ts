import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

import {
  GRATTAGE_CONTRAT_STATUT_LABELS,
  type GrattageContratStatut,
  GRATTAGE_CONTRAT_STATUTS,
} from "@/lib/lonaci/constants";
import type { LonaciRole } from "@/lib/lonaci/constants";
import type { UserDocument } from "@/lib/lonaci/types";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { prisma } from "@/lib/prisma";
import { getDatabase } from "@/lib/mongodb";

const GRATTAGE_CONTRATS_COLLECTION = "grattage_contrats";
const COUNTERS_COLLECTION = "counters";
const GRATTAGE_CONTRAT_COUNTER_ID = "grattage_contrat_ref";

export const GRATTAGE_CONTRAT_STATUSES = GRATTAGE_CONTRAT_STATUTS;
export type GrattageContratStatus = GrattageContratStatut;

type StoredGrattageContrat = {
  _id: ObjectId;
  reference: string;
  concessionnaireId: string;
  agenceId: string | null;
  produitCode: string;
  statut: GrattageContratStatut;
  dateDebut: Date;
  dateFin: Date | null;
  gprRegistrationId: string | null;
  history: Array<{
    from: GrattageContratStatut | null;
    to: GrattageContratStatut;
    byUserId: string;
    at: Date;
    comment: string | null;
  }>;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export async function ensureGrattageContratIndexes() {
  const db = await getDatabase();
  await db.collection<StoredGrattageContrat>(GRATTAGE_CONTRATS_COLLECTION).createIndexes([
    { key: { reference: 1 }, unique: true, name: "uniq_reference" },
    { key: { concessionnaireId: 1, produitCode: 1, statut: 1 }, name: "idx_owner_product_statut" },
    { key: { agenceId: 1, statut: 1 }, name: "idx_agence_statut" },
    { key: { statut: 1, updatedAt: -1 }, name: "idx_statut_updated" },
    { key: { dateFin: 1 }, name: "idx_date_fin" },
  ]);
}

async function nextGrattageContratReference() {
  const db = await getDatabase();
  await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).updateOne(
    { _id: GRATTAGE_CONTRAT_COUNTER_ID },
    { $inc: { seq: 1 } },
    { upsert: true },
  );
  const counter = await db
    .collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION)
    .findOne({ _id: GRATTAGE_CONTRAT_COUNTER_ID });
  return `CGR-${String(counter?.seq ?? 1).padStart(7, "0")}`;
}

async function resolveAgenceId(concessionnaireId: string): Promise<string | null> {
  const pdv = await prisma.concessionnaire.findFirst({
    where: { id: concessionnaireId, deletedAt: null },
    select: { agenceId: true },
  });
  return pdv?.agenceId ?? null;
}

/** Passe en EXPIRÉ les contrats dont la date de fin est dépassée. */
export async function refreshExpiredGrattageContrats() {
  const db = await getDatabase();
  const now = new Date();
  const col = db.collection<StoredGrattageContrat>(GRATTAGE_CONTRATS_COLLECTION);
  const expired = await col
    .find({
      deletedAt: null,
      statut: { $in: ["EN_COURS", "SUSPENDU"] },
      dateFin: { $lte: now },
    })
    .toArray();
  for (const row of expired) {
    await col.updateOne(
      { _id: row._id },
      {
        $set: { statut: "EXPIRE", updatedAt: now, updatedByUserId: "system" },
        $push: {
          history: {
            from: row.statut,
            to: "EXPIRE",
            byUserId: "system",
            at: now,
            comment: "Expiration automatique (date de fin)",
          },
        },
      } as unknown as Record<string, unknown>,
    );
  }
  return expired.length;
}

export function canTransitionGrattageContrat(
  role: LonaciRole,
  from: GrattageContratStatut,
  to: GrattageContratStatut,
): boolean {
  if (from === to) return false;
  if (to === "EXPIRE") return true;
  if (from === "RESILIE" || from === "EXPIRE") return false;
  if (role === "CHEF_SERVICE" || role === "CHEF_SECTION" || role === "ASSIST_CDS") return true;
  if (role === "AGENT") {
    return (
      (from === "EN_COURS" && (to === "SUSPENDU" || to === "RESILIE")) ||
      (from === "SUSPENDU" && to === "EN_COURS")
    );
  }
  return false;
}

export async function createGrattageContrat(input: {
  concessionnaireId: string;
  produitCode: string;
  dateDebut: Date;
  dateFin?: Date | null;
  gprRegistrationId?: string | null;
  actor: UserDocument;
}) {
  const db = await getDatabase();
  const produitCode = input.produitCode.trim().toUpperCase();
  const existing = await db.collection<StoredGrattageContrat>(GRATTAGE_CONTRATS_COLLECTION).findOne({
    concessionnaireId: input.concessionnaireId,
    produitCode,
    deletedAt: null,
    statut: { $in: ["EN_COURS", "SUSPENDU"] },
  });
  if (existing) throw new Error("GRATTAGE_CONTRAT_ALREADY_ACTIVE");

  const now = new Date();
  const reference = await nextGrattageContratReference();
  const agenceId = await resolveAgenceId(input.concessionnaireId);
  const statut: GrattageContratStatut = "EN_COURS";
  const doc: Omit<StoredGrattageContrat, "_id"> = {
    reference,
    concessionnaireId: input.concessionnaireId,
    agenceId,
    produitCode,
    statut,
    dateDebut: input.dateDebut,
    dateFin: input.dateFin ?? null,
    gprRegistrationId: input.gprRegistrationId?.trim() || null,
    history: [{ from: null, to: statut, byUserId: input.actor._id ?? "", at: now, comment: null }],
    createdByUserId: input.actor._id ?? "",
    updatedByUserId: input.actor._id ?? "",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const result = await db.collection<Omit<StoredGrattageContrat, "_id">>(GRATTAGE_CONTRATS_COLLECTION).insertOne(doc);
  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "GRATTAGE_CONTRAT_CREATE",
    userId: input.actor._id ?? "",
    details: { contratId: result.insertedId.toHexString(), reference, produitCode },
  });
  return { id: result.insertedId.toHexString(), reference };
}

/** Crée ou réactive un contrat grattage pour chaque produit GPR validé. */
export async function ensureGrattageContratsFromGpr(input: {
  concessionnaireId: string;
  produitsActifs: string[];
  gprRegistrationId: string;
  dateDebut: Date;
  actor: UserDocument;
}) {
  const created: string[] = [];
  for (const produit of input.produitsActifs) {
    try {
      const row = await createGrattageContrat({
        concessionnaireId: input.concessionnaireId,
        produitCode: produit,
        dateDebut: input.dateDebut,
        gprRegistrationId: input.gprRegistrationId,
        actor: input.actor,
      });
      created.push(row.reference);
    } catch (e) {
      if (e instanceof Error && e.message === "GRATTAGE_CONTRAT_ALREADY_ACTIVE") continue;
      throw e;
    }
  }
  return created;
}

export async function transitionGrattageContrat(input: {
  contratId: string;
  targetStatut: GrattageContratStatut;
  comment: string | null;
  actor: UserDocument;
}) {
  if (!ObjectId.isValid(input.contratId)) throw new Error("GRATTAGE_CONTRAT_NOT_FOUND");
  const db = await getDatabase();
  const row = await db.collection<StoredGrattageContrat>(GRATTAGE_CONTRATS_COLLECTION).findOne({
    _id: new ObjectId(input.contratId),
    deletedAt: null,
  });
  if (!row) throw new Error("GRATTAGE_CONTRAT_NOT_FOUND");
  if (!canTransitionGrattageContrat(input.actor.role, row.statut, input.targetStatut)) {
    throw new Error("FORBIDDEN_TRANSITION");
  }
  const now = new Date();
  await db.collection<StoredGrattageContrat>(GRATTAGE_CONTRATS_COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        statut: input.targetStatut,
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
      },
      $push: {
        history: {
          from: row.statut,
          to: input.targetStatut,
          byUserId: input.actor._id ?? "",
          at: now,
          comment: input.comment,
        },
      },
    } as unknown as Record<string, unknown>,
  );
}

export type GrattageContratListItem = {
  id: string;
  reference: string;
  concessionnaireId: string;
  codePdv: string;
  raisonSociale: string;
  agenceId: string | null;
  produitCode: string;
  statut: GrattageContratStatut;
  statutLabel: string;
  dateDebut: string;
  dateFin: string | null;
  gprRegistrationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listGrattageContrats(params: {
  page: number;
  pageSize: number;
  agenceId?: string;
  concessionnaireId?: string;
  statut?: GrattageContratStatut;
  scopeAgenceId?: string;
}) {
  await refreshExpiredGrattageContrats();
  const db = await getDatabase();
  const filter: Record<string, unknown> = { deletedAt: null };
  const agenceFilter = params.scopeAgenceId ?? params.agenceId;
  if (agenceFilter) filter.agenceId = agenceFilter;
  if (params.concessionnaireId) filter.concessionnaireId = params.concessionnaireId;
  if (params.statut) filter.statut = params.statut;

  const skip = (params.page - 1) * params.pageSize;
  const col = db.collection<StoredGrattageContrat>(GRATTAGE_CONTRATS_COLLECTION);
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(params.pageSize).toArray(),
  ]);

  const pdvIds = [...new Set(rows.map((r) => r.concessionnaireId))];
  const pdvs =
    pdvIds.length > 0
      ? await prisma.concessionnaire.findMany({
          where: { id: { in: pdvIds } },
          select: { id: true, codePdv: true, raisonSociale: true, nomComplet: true },
        })
      : [];
  const pdvMap = new Map(pdvs.map((p) => [p.id, p]));

  const items: GrattageContratListItem[] = rows.map((r) => {
    const pdv = pdvMap.get(r.concessionnaireId);
    return {
      id: r._id.toHexString(),
      reference: r.reference,
      concessionnaireId: r.concessionnaireId,
      codePdv: pdv?.codePdv ?? "—",
      raisonSociale: pdv?.nomComplet || pdv?.raisonSociale || "—",
      agenceId: r.agenceId,
      produitCode: r.produitCode,
      statut: r.statut,
      statutLabel: GRATTAGE_CONTRAT_STATUT_LABELS[r.statut],
      dateDebut: r.dateDebut.toISOString(),
      dateFin: r.dateFin ? r.dateFin.toISOString() : null,
      gprRegistrationId: r.gprRegistrationId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  return { items, total, page: params.page, pageSize: params.pageSize };
}

export async function listGrattageContratsForExport(params: {
  agenceId?: string;
  concessionnaireId?: string;
  statut?: GrattageContratStatut;
  scopeAgenceId?: string;
}) {
  const all: GrattageContratListItem[] = [];
  let page = 1;
  const pageSize = 200;
  for (;;) {
    const batch = await listGrattageContrats({ ...params, page, pageSize });
    all.push(...batch.items);
    if (all.length >= batch.total || batch.items.length === 0) break;
    page += 1;
  }
  return all;
}

export function buildGrattageContratsPdfBuffer(rows: GrattageContratListItem[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 32, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(14).text("Liste des contrats grattage (§9.3)", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(9).text(`Généré le ${new Date().toLocaleString("fr-FR")} · ${rows.length} contrat(s)`);
    doc.moveDown(0.8);

    const colWidths = [70, 55, 120, 50, 55, 55, 55];
    const headers = ["Référence", "Code PDV", "Concessionnaire", "Produit", "Statut", "Début", "Fin"];
    let y = doc.y;
    doc.fontSize(8).font("Helvetica-Bold");
    headers.forEach((h, i) => {
      doc.text(h, 32 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i], continued: false });
    });
    y += 14;
    doc.font("Helvetica");

    for (const r of rows) {
      if (y > 520) {
        doc.addPage();
        y = 40;
      }
      const cells = [
        r.reference,
        r.codePdv,
        r.raisonSociale.slice(0, 40),
        r.produitCode,
        r.statutLabel,
        new Date(r.dateDebut).toLocaleDateString("fr-FR"),
        r.dateFin ? new Date(r.dateFin).toLocaleDateString("fr-FR") : "—",
      ];
      cells.forEach((cell, i) => {
        doc.text(cell, 32 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, {
          width: colWidths[i],
          continued: false,
        });
      });
      y += 12;
    }
    doc.end();
  });
}
