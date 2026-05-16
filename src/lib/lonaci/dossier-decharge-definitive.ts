import "server-only";

import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  DECHARGE_DEFINITIVE_MENTION,
  DECHARGE_DEFINITIVE_TITLE,
} from "@/lib/lonaci/dossier-decharge-constants";
import {
  findAssociatedCautionForDossier,
} from "@/lib/lonaci/dossier-decharge-provisoire";
import { findDossierById } from "@/lib/lonaci/dossiers";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";
import { ensureDossierDocumentChecklist } from "@/lib/lonaci/produit-document-checklist";
import type {
  CautionDocument,
  DossierDocument,
  DossierDocumentChecklistPayload,
} from "@/lib/lonaci/types";
import { formatAgenceLibelle, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";
import { getDatabase } from "@/lib/mongodb";

export {
  DECHARGE_DEFINITIVE_MENTION,
  DECHARGE_DEFINITIVE_TITLE,
} from "@/lib/lonaci/dossier-decharge-constants";

const CAUTIONS_COLLECTION = "cautions";

type StoredCaution = Omit<CautionDocument, "_id"> & { _id: ObjectId };

export interface DossierDechargeDefinitiveView {
  dossierReference: string;
  generatedAt: Date;
  dateValidation: Date;
  mention: string;
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
  agenceLabel: string;
  produitCode: string;
  produitLibelle: string;
  documentsFournis: string[];
  paymentReference: string;
  cautionMontantFCFA: number;
  cautionPaidAt: Date;
  numeroFicheProvisoire: string | null;
  numeroFicheDefinitive: string | null;
  cautionReferenceLabel: string;
}

export function dossierEligibleDechargeDefinitive(
  checklist: DossierDocumentChecklistPayload,
  cautionPaid: boolean,
  hasPaymentReference: boolean,
): boolean {
  if (!checklist.entries.length) return false;
  if (!checklist.complet) return false;
  return cautionPaid && hasPaymentReference;
}

async function loadPaidCautionRecord(cautionId: string): Promise<StoredCaution | null> {
  if (!ObjectId.isValid(cautionId)) return null;
  const db = await getDatabase();
  const row = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne({
    _id: new ObjectId(cautionId),
    deletedAt: null,
    status: "PAYEE",
  });
  return row ?? null;
}

function resolveDateValidation(dossier: DossierDocument, caution: StoredCaution): Date {
  const finalized = [...dossier.history]
    .reverse()
    .find((h) => h.status === "FINALISE" || h.status === "VALIDE_N2");
  if (finalized?.actedAt) return finalized.actedAt;
  if (caution.ficheDefinitiveEmiseLe) return caution.ficheDefinitiveEmiseLe;
  if (caution.paidAt) return caution.paidAt;
  return dossier.updatedAt;
}

export async function buildDossierDechargeDefinitiveView(
  dossierId: string,
): Promise<DossierDechargeDefinitiveView | null> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt || dossier.type !== "CONTRAT_ACTUALISATION") {
    return null;
  }

  const produitCode = String(dossier.payload?.produitCode ?? "").trim().toUpperCase();
  const produit = produitCode ? await resolveProduitForContratWorkflow(produitCode) : null;
  const checklist = ensureDossierDocumentChecklist(dossier.payload ?? {}, produit?.documentsChecklist ?? []);

  const concessionnaire = await findConcessionnaireById(dossier.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    return null;
  }

  const parentContratId =
    typeof dossier.payload?.parentContratId === "string" ? dossier.payload.parentContratId : null;
  const explicitCautionId =
    typeof dossier.payload?.cautionId === "string" ? dossier.payload.cautionId : null;
  const cautionLink = produitCode
    ? await findAssociatedCautionForDossier(
        dossier.concessionnaireId,
        produitCode,
        parentContratId,
        explicitCautionId,
      )
    : null;
  const caution = cautionLink ? await loadPaidCautionRecord(cautionLink.cautionId) : null;
  const paymentReference = caution?.paymentReference?.trim() ?? "";

  if (!dossierEligibleDechargeDefinitive(checklist, Boolean(caution), paymentReference.length > 0)) {
    return null;
  }

  const db = await getDatabase();
  const agenceMap = await loadAgenceLibelleMap(
    db,
    concessionnaire.agenceId ? [concessionnaire.agenceId] : [],
  );
  const agenceLabel = concessionnaire.agenceId
    ? formatAgenceLibelle(agenceMap.get(concessionnaire.agenceId), concessionnaire.agenceId)
    : "Sans agence";

  const documentsFournis = checklist.entries
    .filter((e) => e.statut === "FOURNI")
    .map((e) => (e.obligatoire ? e.libelle : `${e.libelle} (facultatif)`));

  const dateValidation = resolveDateValidation(dossier, caution!);
  const cautionReferenceLabel =
    caution!.numeroFicheDefinitive?.trim() ||
    caution!.numeroFicheProvisoire?.trim() ||
    paymentReference;

  return {
    dossierReference: dossier.reference,
    generatedAt: new Date(),
    dateValidation,
    mention: DECHARGE_DEFINITIVE_MENTION,
    nomComplet: concessionnaire.nomComplet,
    raisonSociale: concessionnaire.raisonSociale,
    codePdv: concessionnaire.codePdv,
    codeTerminal: concessionnaire.codeTerminal,
    codeConcessionnaire: concessionnaire.codeConcessionnaire,
    cniNumero: concessionnaire.cniNumero,
    email: concessionnaire.email,
    telephone:
      concessionnaire.telephonePrincipal?.trim() ||
      concessionnaire.telephone?.trim() ||
      concessionnaire.telephoneSecondaire?.trim() ||
      null,
    adresse: concessionnaire.adresse,
    ville: concessionnaire.ville,
    agenceLabel,
    produitCode: produitCode || "—",
    produitLibelle: produit?.libelle ?? (produitCode || "—"),
    documentsFournis,
    paymentReference,
    cautionMontantFCFA: caution!.montant,
    cautionPaidAt: caution!.paidAt ?? caution!.ficheDefinitiveEmiseLe ?? caution!.updatedAt,
    numeroFicheProvisoire: caution!.numeroFicheProvisoire ?? null,
    numeroFicheDefinitive: caution!.numeroFicheDefinitive ?? null,
    cautionReferenceLabel,
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
  doc.fillColor("#111827").fontSize(13).text(DECHARGE_DEFINITIVE_TITLE, { align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor("#047857").text(DECHARGE_DEFINITIVE_MENTION, { align: "center", underline: true });
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

export async function renderDossierDechargeDefinitivePdf(view: DossierDechargeDefinitiveView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawPdfHeader(doc);

    doc.fontSize(9).fillColor("#374151").text(`Réf. dossier : ${view.dossierReference}`, { align: "center" });
    doc.text(
      `Date de validation : ${view.dateValidation.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`,
      { align: "center" },
    );
    doc.moveDown(0.8);

    drawFieldRow(doc, "Nom complet", view.nomComplet);
    drawFieldRow(doc, "Raison sociale", view.raisonSociale);
    drawFieldRow(doc, "Code PDV", view.codePdv);
    if (view.codeTerminal) drawFieldRow(doc, "Code terminal", view.codeTerminal);
    if (view.codeConcessionnaire) drawFieldRow(doc, "Code concessionnaire", view.codeConcessionnaire);
    if (view.cniNumero) drawFieldRow(doc, "N° CNI", view.cniNumero);
    if (view.email) drawFieldRow(doc, "E-mail", view.email);
    if (view.telephone) drawFieldRow(doc, "Téléphone", view.telephone);
    if (view.adresse) drawFieldRow(doc, "Adresse", view.adresse);
    if (view.ville) drawFieldRow(doc, "Ville", view.ville);
    drawFieldRow(doc, "Agence", view.agenceLabel);
    drawFieldRow(doc, "Produit", `${view.produitCode} — ${view.produitLibelle}`);

    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#111827").text("Caution réglée", { underline: true });
    doc.moveDown(0.4);
    drawFieldRow(doc, "Réf. caution", view.cautionReferenceLabel);
    drawFieldRow(doc, "Montant (FCFA)", view.cautionMontantFCFA.toLocaleString("fr-FR"));
    drawFieldRow(
      doc,
      "Date de paiement",
      view.cautionPaidAt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }),
    );
    if (view.numeroFicheProvisoire) drawFieldRow(doc, "Fiche provisoire (FPC)", view.numeroFicheProvisoire);
    if (view.numeroFicheDefinitive) drawFieldRow(doc, "Fiche définitive (FPD)", view.numeroFicheDefinitive);

    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#047857").text("Référence de paiement", { underline: true });
    doc.moveDown(0.25);
    doc.fontSize(12).fillColor("#065f46").text(view.paymentReference, { align: "center" });
    doc.moveDown(0.8);

    doc.fontSize(10).fillColor("#111827").text("Documents fournis et validés", { underline: true });
    doc.moveDown(0.35);
    if (!view.documentsFournis.length) {
      doc.fontSize(9).fillColor("#6b7280").text("Aucun document listé.");
    } else {
      doc.fontSize(9).fillColor("#374151");
      for (const item of view.documentsFournis) {
        doc.text(`• ${item}`);
      }
    }

    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        "Ce document atteste la complétude du dossier et le règlement de la caution. La référence de paiement est unique et obligatoire pour tout rapprochement comptable.",
        { align: "justify" },
      );

    doc.end();
  });
}
