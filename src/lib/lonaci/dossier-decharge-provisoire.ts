import "server-only";

import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  DECHARGE_PROVISOIRE_DISCLAIMER,
  DECHARGE_PROVISOIRE_TITLE,
} from "@/lib/lonaci/dossier-decharge-constants";
import { findDossierById } from "@/lib/lonaci/dossiers";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";
import {
  DOSSIER_CHECKLIST_STATUT_LABELS,
  ensureDossierDocumentChecklist,
} from "@/lib/lonaci/produit-document-checklist";
import type { CautionDocument, DossierDocument, DossierDocumentChecklistPayload, DossierStatus } from "@/lib/lonaci/types";
import { formatAgenceLibelle, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";

const CAUTIONS_COLLECTION = "cautions";

export {
  DECHARGE_PROVISOIRE_DISCLAIMER,
  DECHARGE_PROVISOIRE_TITLE,
} from "@/lib/lonaci/dossier-decharge-constants";

type StoredCaution = Omit<CautionDocument, "_id"> & { _id: ObjectId };

export interface DossierDechargeProvisoireCautionInfo {
  cautionId: string;
  referenceLabel: string;
  paymentReference: string | null;
  status: string;
  numeroFicheProvisoire: string | null;
  numeroFicheDefinitive: string | null;
}

export interface DossierDechargeProvisoireView {
  dossierReference: string;
  dossierStatus: DossierStatus;
  generatedAt: Date;
  identiteLabel: string;
  identiteDetail: string;
  codePdv: string;
  cniNumero: string | null;
  agenceLabel: string;
  produitCode: string;
  produitLibelle: string;
  documentsFournis: string[];
  documentsManquants: string[];
  caution: DossierDechargeProvisoireCautionInfo | null;
}

export function dossierEligibleDechargeProvisoire(
  checklist: DossierDocumentChecklistPayload,
  dossierStatus: DossierStatus,
): boolean {
  if (dossierStatus === "FINALISE") return false;
  if (!checklist.entries.length) return false;
  return !checklist.complet;
}

function mapCautionReference(caution: StoredCaution): DossierDechargeProvisoireCautionInfo {
  const cautionId = caution._id.toHexString();
  const referenceLabel =
    caution.numeroFicheDefinitive?.trim() ||
    caution.numeroFicheProvisoire?.trim() ||
    caution.paymentReference?.trim() ||
    cautionId;
  return {
    cautionId,
    referenceLabel,
    paymentReference:
      caution.status === "PAYEE" && caution.paymentReference?.trim()
        ? caution.paymentReference.trim()
        : null,
    status: caution.status,
    numeroFicheProvisoire: caution.numeroFicheProvisoire ?? null,
    numeroFicheDefinitive: caution.numeroFicheDefinitive ?? null,
  };
}

export async function findAssociatedCautionForDossier(
  concessionnaireId: string,
  produitCode: string,
  parentContratId?: string | null,
  explicitCautionId?: string | null,
): Promise<DossierDechargeProvisoireCautionInfo | null> {
  const pcode = produitCode.trim().toUpperCase();
  const db = await getDatabase();

  if (explicitCautionId?.trim() && ObjectId.isValid(explicitCautionId.trim())) {
    const direct = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne({
      _id: new ObjectId(explicitCautionId.trim()),
      deletedAt: null,
    });
    if (direct) {
      return mapCautionReference(direct);
    }
  }

  const contratIds = new Set<string>();
  if (parentContratId?.trim()) {
    contratIds.add(parentContratId.trim());
  }

  const contrats = await prisma.contrat.findMany({
    where: { concessionnaireId, produitCode: pcode, deletedAt: null },
    select: { id: true },
  });
  for (const c of contrats) {
    contratIds.add(c.id);
  }

  if (contratIds.size > 0) {
    const rows = await db
      .collection<StoredCaution>(CAUTIONS_COLLECTION)
      .find({ deletedAt: null, contratId: { $in: [...contratIds] } })
      .sort({ updatedAt: -1 })
      .toArray();
    if (rows.length) {
      const paid = rows.find((r) => r.status === "PAYEE");
      return mapCautionReference(paid ?? rows[0]);
    }
  }

  const concessionnaire = await prisma.concessionnaire.findFirst({
    where: { id: concessionnaireId, deletedAt: null },
    select: { codePdv: true },
  });
  if (!concessionnaire?.codePdv) {
    return null;
  }

  const client = await prisma.lonaciClient.findFirst({
    where: { code: concessionnaire.codePdv, deletedAt: null },
    select: { id: true },
  });
  if (!client) {
    return null;
  }

  const clientRows = await db
    .collection<StoredCaution>(CAUTIONS_COLLECTION)
    .find({ deletedAt: null, lonaciClientId: client.id, produitCode: pcode })
    .sort({ updatedAt: -1 })
    .toArray();

  if (!clientRows.length) return null;
  const paid = clientRows.find((r) => r.status === "PAYEE");
  return mapCautionReference(paid ?? clientRows[0]);
}

function splitChecklistDocuments(checklist: DossierDocumentChecklistPayload): {
  documentsFournis: string[];
  documentsManquants: string[];
} {
  const documentsFournis: string[] = [];
  const documentsManquants: string[] = [];
  for (const entry of checklist.entries) {
    const label = entry.obligatoire ? entry.libelle : `${entry.libelle} (facultatif)`;
    if (entry.statut === "FOURNI") {
      documentsFournis.push(label);
    } else {
      const suffix =
        entry.statut === "MANQUANT"
          ? DOSSIER_CHECKLIST_STATUT_LABELS.MANQUANT
          : DOSSIER_CHECKLIST_STATUT_LABELS.EN_ATTENTE;
      documentsManquants.push(`${label} — ${suffix}`);
    }
  }
  return { documentsFournis, documentsManquants };
}

export async function buildDossierDechargeProvisoireView(
  dossierId: string,
): Promise<DossierDechargeProvisoireView | null> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt || dossier.type !== "CONTRAT_ACTUALISATION") {
    return null;
  }

  const produitCode = String(dossier.payload?.produitCode ?? "").trim().toUpperCase();
  const produit = produitCode ? await resolveProduitForContratWorkflow(produitCode) : null;
  const checklist = ensureDossierDocumentChecklist(dossier.payload ?? {}, produit?.documentsChecklist ?? []);
  if (!dossierEligibleDechargeProvisoire(checklist, dossier.status)) {
    return null;
  }

  const concessionnaire = await findConcessionnaireById(dossier.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    return null;
  }

  const parentContratId =
    typeof dossier.payload?.parentContratId === "string" ? dossier.payload.parentContratId : null;
  const explicitCautionId =
    typeof dossier.payload?.cautionId === "string" ? dossier.payload.cautionId : null;
  const caution = produitCode
    ? await findAssociatedCautionForDossier(
        dossier.concessionnaireId,
        produitCode,
        parentContratId,
        explicitCautionId,
      )
    : null;

  const db = await getDatabase();
  const agenceMap = await loadAgenceLibelleMap(
    db,
    concessionnaire.agenceId ? [concessionnaire.agenceId] : [],
  );
  const agenceLabel = concessionnaire.agenceId
    ? formatAgenceLibelle(agenceMap.get(concessionnaire.agenceId), concessionnaire.agenceId)
    : "Sans agence";

  const { documentsFournis, documentsManquants } = splitChecklistDocuments(checklist);

  return {
    dossierReference: dossier.reference,
    dossierStatus: dossier.status,
    generatedAt: new Date(),
    identiteLabel: "Concessionnaire",
    identiteDetail: concessionnaire.raisonSociale?.trim() || concessionnaire.nomComplet || "—",
    codePdv: concessionnaire.codePdv ?? "",
    cniNumero: concessionnaire.cniNumero,
    agenceLabel,
    produitCode: produitCode || "—",
    produitLibelle: produit?.libelle ?? (produitCode || "—"),
    documentsFournis,
    documentsManquants,
    caution,
  };
}

function drawPdfHeader(doc: InstanceType<typeof PDFDocument>) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  doc.save();
  doc.rect(x, doc.y, w, 52).fill("#0f3d2e");
  doc.fillColor("#ffffff").fontSize(11).text("LONACI", x + 14, doc.y - 44);
  doc.fontSize(8).text("Loterie Nationale de Côte d’Ivoire", x + 14, doc.y + 2);
  doc.fontSize(7).text("Document officiel — module Dossiers", x + 14, doc.y + 2);
  doc.restore();
  doc.moveDown(3.2);
  doc.fillColor("#111827").fontSize(13).text(DECHARGE_PROVISOIRE_TITLE, { align: "center" });
  doc.moveDown(0.8);
}

function drawFieldRow(doc: InstanceType<typeof PDFDocument>, label: string, value: string) {
  const y = doc.y;
  doc.fontSize(9).fillColor("#6b7280").text(label, doc.page.margins.left, y, { width: 160 });
  doc.fontSize(10).fillColor("#111827").text(value, doc.page.margins.left + 165, y, {
    width: doc.page.width - doc.page.margins.right - doc.page.margins.left - 170,
    align: "right",
  });
  doc.moveDown(0.55);
}

function drawBulletList(doc: InstanceType<typeof PDFDocument>, title: string, items: string[], emptyLabel: string) {
  doc.fontSize(10).fillColor("#111827").text(title, { underline: true });
  doc.moveDown(0.35);
  if (!items.length) {
    doc.fontSize(9).fillColor("#6b7280").text(emptyLabel);
  } else {
    doc.fontSize(9).fillColor("#374151");
    for (const item of items) {
      doc.text(`• ${item}`);
    }
  }
  doc.moveDown(0.6);
}

export async function renderDossierDechargeProvisoirePdf(view: DossierDechargeProvisoireView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawPdfHeader(doc);

    doc.fontSize(9).fillColor("#374151").text(`Réf. dossier : ${view.dossierReference}`, { align: "center" });
    doc.text(`Date : ${view.generatedAt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`, {
      align: "center",
    });
    doc.moveDown(0.8);

    drawFieldRow(doc, view.identiteLabel, view.identiteDetail);
    drawFieldRow(doc, "Code PDV", view.codePdv);
    if (view.cniNumero) drawFieldRow(doc, "N° CNI", view.cniNumero);
    drawFieldRow(doc, "Agence", view.agenceLabel);
    drawFieldRow(doc, "Produit", `${view.produitCode} — ${view.produitLibelle}`);

    if (view.caution) {
      drawFieldRow(doc, "Réf. caution associée", view.caution.referenceLabel);
      if (view.caution.numeroFicheProvisoire) {
        drawFieldRow(doc, "Fiche provisoire (FPC)", view.caution.numeroFicheProvisoire);
      }
      if (view.caution.paymentReference) {
        drawFieldRow(doc, "Référence de paiement", view.caution.paymentReference);
      }
    } else {
      drawFieldRow(doc, "Réf. caution associée", "Aucune caution liée identifiée");
    }

    doc.moveDown(0.4);
    drawBulletList(doc, "Documents fournis", view.documentsFournis, "Aucun document marqué comme fourni.");
    drawBulletList(doc, "Documents manquants ou en attente", view.documentsManquants, "Aucun document en attente.");

    doc.moveDown(0.4);
    doc
      .fontSize(8)
      .fillColor("#b45309")
      .text(DECHARGE_PROVISOIRE_DISCLAIMER, { align: "justify" });

    doc.end();
  });
}

export async function buildDechargeFromDossier(dossier: DossierDocument): Promise<DossierDechargeProvisoireView | null> {
  if (!dossier._id) return null;
  return buildDossierDechargeProvisoireView(dossier._id);
}
