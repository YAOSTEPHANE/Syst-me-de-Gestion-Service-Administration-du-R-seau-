import "server-only";

import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

import {
  DECHARGE_DEFINITIVE_MENTION,
  DECHARGE_DEFINITIVE_TITLE,
  dossierEligibleDechargeDefinitive,
} from "@/lib/lonaci/dossier-decharge-constants";
import { loadPartySnapshotForDossier } from "@/lib/lonaci/contrat-party-snapshot";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";
import { findDossierById } from "@/lib/lonaci/dossiers";
import {
  ensureChecklistForDossierProduits,
  getDossierProduitCodes,
  resolveDossierCautionsStatus,
} from "@/lib/lonaci/dossier-produits";
import type {
  CautionDocument,
  DossierDocument,
  DossierDocumentChecklistPayload,
} from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";

export {
  DECHARGE_DEFINITIVE_DESCRIPTION,
  DECHARGE_DEFINITIVE_MENTION,
  DECHARGE_DEFINITIVE_TITLE,
  dossierEligibleDechargeDefinitive,
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
  produitCodes: string[];
  produitLibelles: string[];
  documentsFournis: string[];
  paymentReference: string;
  cautionMontantFCFA: number;
  cautionPaidAt: Date;
  numeroFicheProvisoire: string | null;
  numeroFicheDefinitive: string | null;
  cautionReferenceLabel: string;
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

  const produitCodes = getDossierProduitCodes(dossier.payload ?? {});
  const checklist = await ensureChecklistForDossierProduits(dossier.payload ?? {}, produitCodes);
  const cautionsStatus = await resolveDossierCautionsStatus(dossier);

  const partySnapshot = await loadPartySnapshotForDossier(dossier);
  if (!partySnapshot) {
    return null;
  }

  const paymentReference = cautionsStatus.primaryPaymentReference ?? "";
  if (
    !dossierEligibleDechargeDefinitive(checklist, cautionsStatus.allPaid, paymentReference.length > 0)
  ) {
    return null;
  }

  const produits = await Promise.all(
    produitCodes.map((code) => resolveProduitForContratWorkflow(code)),
  );
  const produitLibelles = produitCodes.map((code, i) => produits[i]?.libelle ?? code);
  const primaryCode = produitCodes[0] ?? "—";
  const primaryLink = cautionsStatus.links.find((l) => l.produitCode === primaryCode) ?? cautionsStatus.links[0];
  const caution = primaryLink?.cautionId ? await loadPaidCautionRecord(primaryLink.cautionId) : null;
  if (!caution) {
    return null;
  }

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
    nomComplet: partySnapshot.nomComplet,
    raisonSociale: partySnapshot.raisonSociale,
    codePdv: partySnapshot.codePdv,
    codeTerminal: partySnapshot.codeTerminal,
    codeConcessionnaire: partySnapshot.codeConcessionnaire,
    cniNumero: partySnapshot.cniNumero,
    email: partySnapshot.email,
    telephone: partySnapshot.telephone,
    adresse: partySnapshot.adresse,
    ville: partySnapshot.ville,
    agenceLabel: partySnapshot.agenceLabel,
    produitCode: primaryCode,
    produitLibelle: produitLibelles[0] ?? primaryCode,
    produitCodes,
    produitLibelles,
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
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const topY = doc.page.margins.top;
  const bandH = 52;
  doc.save();
  doc.rect(x, topY, w, bandH).fill("#0f3d2e");
  doc.fillColor("#ffffff").fontSize(11).text("LONACI", x + 14, topY + 10);
  doc.fontSize(8).text("Loterie Nationale de Côte d’Ivoire", x + 14, topY + 26);
  doc.fontSize(7).text("Document officiel — module Contrats", x + 14, topY + 38);
  doc.restore();
  doc.y = topY + bandH + 14;
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
