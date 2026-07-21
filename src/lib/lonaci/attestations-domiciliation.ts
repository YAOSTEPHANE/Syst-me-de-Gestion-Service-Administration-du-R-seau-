import { ObjectId } from "mongodb";

import { sendSmtpEmail } from "@/lib/email/smtp";
import {
  concessionnaireListScopeAgenceId,
  findConcessionnaireById,
} from "@/lib/lonaci/concessionnaires";
import type { AttestationDomiciliationStatus, AttestationDomiciliationType } from "@/lib/lonaci/constants";
import { getDatabase } from "@/lib/mongodb";
import type { UserDocument } from "@/lib/lonaci/types";
import { prisma } from "@/lib/prisma";

const COLLECTION = "attestations_domiciliation";

interface DemandeStored {
  _id: ObjectId;
  type: AttestationDomiciliationType;
  concessionnaireId: string | null;
  agenceId: string | null;
  produitCode: string | null;
  dateDemande: Date;
  statut: AttestationDomiciliationStatus;
  observations: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  transmittedByUserId: string | null;
  finalizedByUserId: string | null;
  validatedByUserId: string | null;
  sentToClientByUserId: string | null;
  transmittedAt: Date | null;
  finalizedAt: Date | null;
  validatedAt: Date | null;
  sentToClientAt: Date | null;
  clientEmailSentTo: string | null;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function attestationsListScopeAgenceId(user: UserDocument): string | undefined {
  return concessionnaireListScopeAgenceId(user);
}

function msToDays(ms: number): number {
  return Math.round((ms / 86_400_000) * 10) / 10;
}

/** Délai entre la soumission (`dateDemande`) et la transmission au client. */
export function computeDelaiTraitementClientJours(
  dateDemande: Date,
  sentToClientAt: Date | null,
): number | null {
  if (!sentToClientAt) return null;
  const ms = sentToClientAt.getTime() - dateDemande.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return msToDays(ms);
}

async function resolveAgenceIdForConcessionnaire(
  concessionnaireId: string | null,
): Promise<string | null> {
  if (!concessionnaireId?.trim()) return null;
  const row = await prisma.concessionnaire.findFirst({
    where: { id: concessionnaireId.trim(), deletedAt: null },
    select: { agenceId: true },
  });
  return row?.agenceId ?? null;
}

async function concessionnaireIdsForAgence(agenceId: string): Promise<string[]> {
  const rows = await prisma.concessionnaire.findMany({
    where: { deletedAt: null, agenceId: agenceId.trim() },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function ensureAttestationsDomiciliationIndexes() {
  const db = await getDatabase();
  await db.collection<DemandeStored>(COLLECTION).createIndexes([
    { key: { dateDemande: -1 }, name: "idx_date_demande" },
    { key: { statut: 1, updatedAt: -1 }, name: "idx_statut_updated" },
    { key: { type: 1, dateDemande: -1 }, name: "idx_type_date" },
    { key: { concessionnaireId: 1, dateDemande: -1 }, name: "idx_concessionnaire_date" },
    { key: { agenceId: 1, dateDemande: -1 }, name: "idx_agence_date" },
    { key: { produitCode: 1, dateDemande: -1 }, name: "idx_produit_date" },
    { key: { deletedAt: 1 }, name: "idx_deleted" },
  ]);
}

export async function createDemandeAttestationDomiciliation(input: {
  type: AttestationDomiciliationType;
  concessionnaireId: string | null;
  produitCode: string | null;
  dateDemande: Date;
  observations: string | null;
  actorId: string;
}) {
  const db = await getDatabase();
  const now = new Date();
  const agenceId = await resolveAgenceIdForConcessionnaire(input.concessionnaireId);
  const doc: Omit<DemandeStored, "_id"> = {
    type: input.type,
    concessionnaireId: input.concessionnaireId,
    agenceId,
    produitCode: input.produitCode ? input.produitCode.trim().toUpperCase() : null,
    dateDemande: input.dateDemande,
    statut: "DEMANDE_RECUE",
    observations: input.observations,
    createdByUserId: input.actorId,
    updatedByUserId: input.actorId,
    transmittedByUserId: null,
    finalizedByUserId: null,
    validatedByUserId: null,
    sentToClientByUserId: null,
    transmittedAt: null,
    finalizedAt: null,
    validatedAt: null,
    sentToClientAt: null,
    clientEmailSentTo: null,
    submittedAt: input.dateDemande,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const res = await db.collection<DemandeStored>(COLLECTION).insertOne(doc as DemandeStored);
  return { id: res.insertedId.toHexString(), statut: doc.statut };
}

export async function transitionDemandeAttestationDomiciliation(input: {
  id: string;
  target: AttestationDomiciliationStatus;
  role: string;
  actorId: string;
}) {
  if (!ObjectId.isValid(input.id)) throw new Error("DEMANDE_NOT_FOUND");
  const db = await getDatabase();
  const row = await db
    .collection<DemandeStored>(COLLECTION)
    .findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) throw new Error("DEMANDE_NOT_FOUND");

  const now = new Date();
  const $set: Record<string, unknown> = {
    statut: input.target,
    updatedAt: now,
    updatedByUserId: input.actorId,
  };

  if (row.statut === "DEMANDE_RECUE" && input.target === "TRANSMIS") {
    if (input.role !== "CHEF_SERVICE") throw new Error("FORBIDDEN_TRANSITION");
    $set.transmittedAt = now;
    $set.transmittedByUserId = input.actorId;
  } else if (row.statut === "TRANSMIS" && input.target === "FINALISE") {
    if (input.role !== "ASSIST_CDS") throw new Error("FORBIDDEN_TRANSITION");
    $set.finalizedAt = now;
    $set.finalizedByUserId = input.actorId;
  } else if (row.statut === "FINALISE" && input.target === "VALIDE") {
    if (input.role !== "CHEF_SERVICE") throw new Error("FORBIDDEN_TRANSITION");
    $set.validatedAt = now;
    $set.validatedByUserId = input.actorId;
  } else if (input.target === "ENVOYE_CLIENT") {
    throw new Error("USE_ENVOYER_CLIENT_ENDPOINT");
  } else {
    throw new Error("INVALID_TRANSITION");
  }

  await db.collection<DemandeStored>(COLLECTION).updateOne({ _id: row._id }, { $set });
}

export type EnvoyerAttestationClientResult = {
  statut: "ENVOYE_CLIENT";
  sentToClientAt: string;
  clientEmailSentTo: string;
  smtpSent: boolean;
  smtpSkippedReason?: string;
};

/** Envoie le courriel par SMTP, puis horodate le passage au statut ENVOYE_CLIENT. */
export async function envoyerAttestationAuClient(input: {
  id: string;
  role: string;
  actorId: string;
}): Promise<EnvoyerAttestationClientResult> {
  if (input.role !== "CHEF_SERVICE") throw new Error("FORBIDDEN_TRANSITION");
  if (!ObjectId.isValid(input.id)) throw new Error("DEMANDE_NOT_FOUND");

  const db = await getDatabase();
  const row = await db
    .collection<DemandeStored>(COLLECTION)
    .findOne({ _id: new ObjectId(input.id), deletedAt: null });
  if (!row) throw new Error("DEMANDE_NOT_FOUND");
  if (row.statut !== "VALIDE") throw new Error("INVALID_TRANSITION");

  if (!row.concessionnaireId?.trim()) throw new Error("CLIENT_EMAIL_MISSING");

  const concessionnaire = await findConcessionnaireById(row.concessionnaireId);
  const clientEmail = concessionnaire?.email?.trim();
  if (!clientEmail) throw new Error("CLIENT_EMAIL_MISSING");

  const typeLabel =
    row.type === "ATTESTATION_REVENU" ? "Attestation de revenu" : "Domiciliation produit";
  const subject = `LONACI — ${typeLabel}`;
  const text = [
    "Bonjour,",
    "",
    `Veuillez trouver ci-joint la confirmation de votre ${typeLabel.toLowerCase()}.`,
    row.produitCode ? `Produit : ${row.produitCode}.` : "",
    `Référence demande : ${row._id.toHexString()}.`,
    `Date de demande : ${row.dateDemande.toLocaleDateString("fr-FR")}.`,
    "",
    "Cordialement,",
    "LONACI",
  ]
    .filter(Boolean)
    .join("\n");

  const emailResult = await sendSmtpEmail([clientEmail], subject, text);
  if (!emailResult.sent) throw new Error("SMTP_SEND_FAILED");

  const now = new Date();
  await db.collection<DemandeStored>(COLLECTION).updateOne(
    { _id: row._id },
    {
      $set: {
        statut: "ENVOYE_CLIENT",
        sentToClientAt: now,
        sentToClientByUserId: input.actorId,
        clientEmailSentTo: clientEmail,
        updatedAt: now,
        updatedByUserId: input.actorId,
      },
    },
  );

  return {
    statut: "ENVOYE_CLIENT",
    sentToClientAt: now.toISOString(),
    clientEmailSentTo: clientEmail,
    smtpSent: emailResult.sent,
    smtpSkippedReason: emailResult.skippedReason,
  };
}

export type AttestationsDomiciliationListFilters = {
  type?: AttestationDomiciliationType;
  concessionnaireId?: string;
  produitCode?: string;
  statut?: AttestationDomiciliationStatus;
  agenceId?: string;
  scopeAgenceId?: string;
  scopeAgenceIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
};

function buildAttestationsDomiciliationFilterBase(
  input: AttestationsDomiciliationListFilters,
): Record<string, unknown> {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (input.type) filter.type = input.type;
  if (input.concessionnaireId) filter.concessionnaireId = input.concessionnaireId;
  if (input.produitCode) filter.produitCode = input.produitCode.trim().toUpperCase();
  if (input.statut) filter.statut = input.statut;
  if (input.dateFrom || input.dateTo) {
    const r: Record<string, Date> = {};
    if (input.dateFrom) r.$gte = input.dateFrom;
    if (input.dateTo) r.$lte = input.dateTo;
    filter.dateDemande = r;
  }
  return filter;
}

async function concessionnaireIdsForAgences(agenceIds: string[]): Promise<string[]> {
  const ids = agenceIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await prisma.concessionnaire.findMany({
    where: { deletedAt: null, agenceId: { in: ids } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function applyAgenceScopeToFilter(
  filter: Record<string, unknown>,
  input: AttestationsDomiciliationListFilters,
): Promise<void> {
  const agenceIds =
    input.scopeAgenceIds && input.scopeAgenceIds.length > 0
      ? input.scopeAgenceIds
      : (input.agenceId ?? input.scopeAgenceId)?.trim()
        ? [(input.agenceId ?? input.scopeAgenceId)!.trim()]
        : [];
  if (agenceIds.length === 0) return;

  const pdvIds =
    agenceIds.length === 1
      ? await concessionnaireIdsForAgence(agenceIds[0]!)
      : await concessionnaireIdsForAgences(agenceIds);

  if (input.concessionnaireId) {
    const allowed = pdvIds.includes(input.concessionnaireId);
    filter.concessionnaireId = allowed ? input.concessionnaireId : "__none__";
    return;
  }

  const agenceMongo =
    agenceIds.length === 1 ? agenceIds[0] : { $in: agenceIds };

  filter.$or = [
    { agenceId: agenceMongo },
    { concessionnaireId: { $in: pdvIds.length ? pdvIds : ["__none__"] } },
  ];
}

async function buildAttestationsDomiciliationFilter(
  input: AttestationsDomiciliationListFilters,
): Promise<Record<string, unknown>> {
  const filter = buildAttestationsDomiciliationFilterBase(input);
  await applyAgenceScopeToFilter(filter, input);
  return filter;
}

/** Indicateurs du tableau de bord des attestations. */
export interface AttestationsDomiciliationDashboardIndicators {
  type: AttestationDomiciliationType | null;
  agenceId: string | null;
  /** Compteur total des demandes en cours et traitées (périmètre filtré). */
  nombreDemandes: number;
  enCours: number;
  transmisDfc: number;
  finalise: number;
  valide: number;
  envoyeClient: number;
  /** Délai moyen soumission → transmission au client (jours). */
  tempsTraitementMoyenClientJours: number | null;
  tempsTraitementEchantillon: number;
  enAttentePlus7Jours: number;
  finaliseThisMonth: number;
  createdThisMonth: number;
  tauxFinalisationClientPct: number | null;
}

export async function getAttestationsDomiciliationDashboardIndicators(
  input: AttestationsDomiciliationListFilters,
): Promise<AttestationsDomiciliationDashboardIndicators> {
  const db = await getDatabase();
  const filter = await buildAttestationsDomiciliationFilter(input);
  const col = db.collection<DemandeStored>(COLLECTION);

  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const startNext = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  const staleBefore = new Date(now);
  staleBefore.setDate(staleBefore.getDate() - 7);

  const [facet] = await col
    .aggregate<{
      byStatut: { _id: AttestationDomiciliationStatus; count: number }[];
      finaliseThisMonth: { n: number }[];
      createdThisMonth: { n: number }[];
      staleDemandeRecue: { n: number }[];
      delaiClient: { avgMs: number | null; n: number }[];
    }>([
      { $match: filter },
      {
        $facet: {
          byStatut: [{ $group: { _id: "$statut", count: { $sum: 1 } } }],
          finaliseThisMonth: [
            {
              $match: {
                statut: { $in: ["FINALISE", "VALIDE", "ENVOYE_CLIENT"] },
                finalizedAt: { $gte: startMonth, $lt: startNext },
              },
            },
            { $count: "n" },
          ],
          createdThisMonth: [
            { $match: { createdAt: { $gte: startMonth, $lt: startNext } } },
            { $count: "n" },
          ],
          staleDemandeRecue: [
            {
              $match: {
                statut: "DEMANDE_RECUE",
                dateDemande: { $lte: staleBefore },
              },
            },
            { $count: "n" },
          ],
          delaiClient: [
            {
              $match: {
                sentToClientAt: { $type: "date" },
              },
            },
            {
              $group: {
                _id: null,
                avgMs: { $avg: { $subtract: ["$sentToClientAt", "$dateDemande"] } },
                n: { $sum: 1 },
              },
            },
          ],
        },
      },
    ])
    .toArray();

  const byStatut = facet?.byStatut ?? [];
  const countFor = (statut: AttestationDomiciliationStatus) =>
    byStatut.find((r) => r._id === statut)?.count ?? 0;

  const enCours = countFor("DEMANDE_RECUE");
  const transmisDfc = countFor("TRANSMIS");
  const finalise = countFor("FINALISE");
  const valide = countFor("VALIDE");
  const envoyeClient = countFor("ENVOYE_CLIENT");
  const nombreDemandes = enCours + transmisDfc + finalise + valide + envoyeClient;

  const delaiRow = facet?.delaiClient?.[0];
  const avgMs = delaiRow?.avgMs;
  const tempsTraitementMoyenClientJours =
    avgMs != null && Number.isFinite(avgMs) ? msToDays(avgMs) : null;

  return {
    type: input.type ?? null,
    agenceId: input.agenceId ?? input.scopeAgenceId ?? null,
    nombreDemandes,
    enCours,
    transmisDfc,
    finalise,
    valide,
    envoyeClient,
    tempsTraitementMoyenClientJours,
    tempsTraitementEchantillon: delaiRow?.n ?? 0,
    enAttentePlus7Jours: facet?.staleDemandeRecue?.[0]?.n ?? 0,
    finaliseThisMonth: facet?.finaliseThisMonth?.[0]?.n ?? 0,
    createdThisMonth: facet?.createdThisMonth?.[0]?.n ?? 0,
    tauxFinalisationClientPct:
      nombreDemandes > 0 ? Math.round((envoyeClient / nombreDemandes) * 1000) / 10 : null,
  };
}

function mapDemandeToListItem(r: DemandeStored) {
  const delaiTraitementClientJours = computeDelaiTraitementClientJours(
    r.dateDemande,
    r.sentToClientAt,
  );
  return {
    id: r._id.toHexString(),
    type: r.type,
    concessionnaireId: r.concessionnaireId,
    agenceId: r.agenceId,
    produitCode: r.produitCode,
    dateDemande: r.dateDemande.toISOString(),
    statut: r.statut,
    observations: r.observations,
    transmittedAt: r.transmittedAt?.toISOString() ?? null,
    finalizedAt: r.finalizedAt?.toISOString() ?? null,
    validatedAt: r.validatedAt?.toISOString() ?? null,
    sentToClientAt: r.sentToClientAt?.toISOString() ?? null,
    clientEmailSentTo: r.clientEmailSentTo ?? null,
    submittedAt: (r.submittedAt ?? r.createdAt).toISOString(),
    delaiTraitementClientJours,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listDemandesAttestationsDomiciliation(input: {
  page: number;
  pageSize: number;
} & AttestationsDomiciliationListFilters) {
  const db = await getDatabase();
  const filter = await buildAttestationsDomiciliationFilter(input);

  const col = db.collection<DemandeStored>(COLLECTION);
  const skip = (input.page - 1) * input.pageSize;
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col.find(filter).sort({ dateDemande: -1, createdAt: -1 }).skip(skip).limit(input.pageSize).toArray(),
  ]);

  return {
    items: rows.map(mapDemandeToListItem),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}
