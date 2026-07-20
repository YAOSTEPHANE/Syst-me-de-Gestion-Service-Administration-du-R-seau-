import "server-only";

import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

import { sendSmtpEmail } from "@/lib/email/smtp";
import {
  CAUTION_FICHE_DEFINITIVE_TITLE,
  CAUTION_FICHE_PAYEE_MENTION,
} from "@/lib/lonaci/caution-fiche-definitive-constants";
import { CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL } from "@/lib/lonaci/caution-fiche-provisoire-constants";
import {
  type CautionEncaissementMode,
  type CautionPaymentMode,
  getCautionEncaissementModeLabel,
} from "@/lib/lonaci/constants";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import { listProduits } from "@/lib/lonaci/referentials";
import { formatAgenceLibelle, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";
import type { CautionDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";

export {
  CAUTION_FICHE_DEFINITIVE_TITLE,
  CAUTION_FICHE_PAYEE_MENTION,
} from "@/lib/lonaci/caution-fiche-definitive-constants";

const CAUTIONS_COLLECTION = "cautions";
const CONTRATS_COLLECTION = "contrats";
const COUNTERS_COLLECTION = "counters";
const CAUTION_PAY_REF_COUNTER_PREFIX = "caution_pay_ref_";

type StoredCaution = Omit<CautionDocument, "_id"> & { _id: ObjectId };
type StoredContrat = { _id: ObjectId; concessionnaireId: string; produitCode: string; deletedAt: Date | null };

export interface CautionFicheDefinitiveView {
  cautionId: string;
  numeroFicheDefinitive: string;
  paymentReference: string;
  datePaiement: string;
  emiseLe: string;
  montantFCFA: number;
  modeReglement: CautionEncaissementMode | CautionPaymentMode;
  modeLibelle: string;
  identiteLabel: string;
  identiteDetail: string;
  clientCode: string | null;
  lonaciClientId: string | null;
  contratId: string | null;
  produitCode: string;
  produitLibelle: string | null;
  agenceLabel: string;
  numeroFicheProvisoire: string | null;
  destinataireEmail: string | null;
}

export interface CautionFicheEmailResult {
  emailSent: boolean;
  emailSkippedReason?: string;
  destinataireEmail: string | null;
}

export function isCautionPaymentRefAutoGenerateEnabled(): boolean {
  const v = process.env.CAUTION_PAYMENT_REF_AUTO_GENERATE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isCautionFpdQrEnabled(): boolean {
  const v = process.env.CAUTION_FPD_QR_ENABLED?.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

export function buildCautionFicheVerificationPayload(view: Pick<
  CautionFicheDefinitiveView,
  "cautionId" | "numeroFicheDefinitive" | "paymentReference"
>): string {
  return [
    "LONACI",
    "CAUTION",
    view.cautionId,
    view.numeroFicheDefinitive,
    view.paymentReference,
  ].join("|");
}

export async function allocateCautionPaymentReference(): Promise<string> {
  const db = await getDatabase();
  const year = new Date().getFullYear();
  const counterId = `${CAUTION_PAY_REF_COUNTER_PREFIX}${year}`;
  await db
    .collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION)
    .updateOne({ _id: counterId }, { $inc: { seq: 1 } }, { upsert: true });
  const c = await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).findOne({ _id: counterId });
  const seq = c?.seq ?? 1;
  return `PAY-${year}-${String(seq).padStart(6, "0")}`;
}

export async function resolveCautionPaymentReference(inputRef: string | undefined | null): Promise<string> {
  const trimmed = (inputRef ?? "").trim();
  if (trimmed) {
    if (trimmed.toUpperCase().startsWith("PROVISOIRE:")) {
      throw new Error("CAUTION_PAYMENT_REFERENCE_REQUISE");
    }
    return trimmed;
  }
  if (isCautionPaymentRefAutoGenerateEnabled()) {
    return allocateCautionPaymentReference();
  }
  throw new Error("CAUTION_REGULARISATION_REFERENCE_REQUISE");
}

async function resolveDestinataireEmail(caution: StoredCaution): Promise<string | null> {
  const pdvId = caution.concessionnaireId?.trim();
  if (pdvId) {
    const conc = await findConcessionnaireById(pdvId);
    return conc?.email?.trim() || null;
  }
  const lid = caution.lonaciClientId?.trim();
  if (lid) {
    const client = await findLonaciClientById(lid);
    const email = client?.email?.trim();
    return email || null;
  }
  const cid = caution.contratId?.trim();
  if (!cid || !ObjectId.isValid(cid)) return null;
  const db = await getDatabase();
  const contrat = await db.collection<StoredContrat>(CONTRATS_COLLECTION).findOne({
    _id: new ObjectId(cid),
    deletedAt: null,
  });
  if (!contrat) return null;
  const conc = await findConcessionnaireById(contrat.concessionnaireId);
  return conc?.email?.trim() || null;
}

export async function buildCautionFicheDefinitiveView(cautionId: string): Promise<CautionFicheDefinitiveView | null> {
  if (!ObjectId.isValid(cautionId)) return null;
  const db = await getDatabase();
  const caution = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne({
    _id: new ObjectId(cautionId),
    deletedAt: null,
  });
  if (!caution?.numeroFicheDefinitive?.trim()) return null;

  const produits = await listProduits();
  const pcode = (caution.produitCode ?? "").trim().toUpperCase();
  const produit = produits.find((p) => p.code.toUpperCase() === pcode);

  let identiteLabel = "Porteur / client";
  let identiteDetail = "—";
  let clientCode: string | null = null;
  let lonaciClientId: string | null = null;
  let contratId: string | null = null;
  let agenceIdForLabel: string | null = null;

  const pdvLinkId = caution.concessionnaireId?.trim();
  if (pdvLinkId) {
    const conc = await findConcessionnaireById(pdvLinkId);
    identiteLabel = "Concessionnaire";
    identiteDetail = conc?.raisonSociale ?? conc?.nomComplet ?? "—";
    agenceIdForLabel = conc?.agenceId ?? null;
  } else {
    const lid = caution.lonaciClientId?.trim();
    if (lid) {
      lonaciClientId = lid;
      const client = await findLonaciClientById(lid);
      clientCode = client?.code ?? null;
      identiteDetail = client?.nomComplet?.trim() || client?.raisonSociale || "—";
      agenceIdForLabel = client?.agenceId ?? null;
    } else if (caution.contratId?.trim()) {
      contratId = caution.contratId.trim();
      const contrat = await db.collection<StoredContrat>(CONTRATS_COLLECTION).findOne({
        _id: new ObjectId(contratId),
        deletedAt: null,
      });
      if (contrat) {
        const conc = await findConcessionnaireById(contrat.concessionnaireId);
        identiteLabel = "Concessionnaire";
        identiteDetail = conc?.raisonSociale ?? conc?.nomComplet ?? "—";
        agenceIdForLabel = conc?.agenceId ?? null;
      }
    }
  }

  const agenceMap = await loadAgenceLibelleMap(db, agenceIdForLabel ? [agenceIdForLabel] : []);
  const agenceLabel = agenceIdForLabel
    ? formatAgenceLibelle(agenceMap.get(agenceIdForLabel), agenceIdForLabel)
    : "Sans agence";

  const datePaiement = (caution.ficheDefinitiveEmiseLe ?? caution.paidAt ?? caution.updatedAt).toISOString();
  const destinataireEmail = await resolveDestinataireEmail(caution);

  return {
    cautionId,
    numeroFicheDefinitive: caution.numeroFicheDefinitive.trim(),
    paymentReference: caution.paymentReference,
    datePaiement,
    emiseLe: (caution.ficheDefinitiveEmiseLe ?? caution.updatedAt).toISOString(),
    montantFCFA: caution.montant,
    modeReglement: caution.modeReglement,
    modeLibelle: getCautionEncaissementModeLabel(caution.modeReglement),
    identiteLabel,
    identiteDetail,
    clientCode,
    lonaciClientId,
    contratId,
    produitCode: pcode || (caution.produitCode ?? "—"),
    produitLibelle: produit?.libelle ?? null,
    agenceLabel,
    numeroFicheProvisoire: caution.numeroFicheProvisoire ?? null,
    destinataireEmail,
  };
}

export async function renderCautionFicheDefinitiveQrPng(view: CautionFicheDefinitiveView): Promise<Buffer | null> {
  if (!isCautionFpdQrEnabled()) return null;
  const payload = buildCautionFicheVerificationPayload(view);
  return QRCode.toBuffer(payload, { type: "png", margin: 1, width: 180 });
}

function drawLonaciPdfHeader(doc: InstanceType<typeof PDFDocument>) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  doc.save();
  doc.rect(x, doc.y, w, 52).fill("#0f3d2e");
  doc.fillColor("#ffffff").fontSize(11).text("LONACI", x + 14, doc.y - 44, { continued: false });
  doc.fontSize(8).text("Loterie Nationale de Côte d’Ivoire", x + 14, doc.y + 2);
  doc.fontSize(7).text("Document officiel — module Cautions", x + 14, doc.y + 2);
  doc.restore();
  doc.moveDown(3.2);
  doc.fillColor("#111827").fontSize(13).text(CAUTION_FICHE_DEFINITIVE_TITLE, { align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor("#047857").text(CAUTION_FICHE_PAYEE_MENTION, { align: "center", underline: true });
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

export async function renderCautionFicheDefinitivePdf(view: CautionFicheDefinitiveView): Promise<Buffer> {
  const qrPng = await renderCautionFicheDefinitiveQrPng(view);
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawLonaciPdfHeader(doc);

    doc.fontSize(9).fillColor("#374151").text(`Réf. document : ${view.numeroFicheDefinitive}`, { align: "center" });
    doc.moveDown(0.8);

    drawFieldRow(doc, "Identité", view.identiteDetail);
    if (view.clientCode) drawFieldRow(doc, "Code client", view.clientCode);
    if (view.contratId) drawFieldRow(doc, "Contrat", view.contratId);
    drawFieldRow(doc, "Produit", view.produitLibelle ? `${view.produitCode} — ${view.produitLibelle}` : view.produitCode);
    drawFieldRow(doc, CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL, view.agenceLabel);
    drawFieldRow(doc, "Montant payé (FCFA)", view.montantFCFA.toLocaleString("fr-FR"));
    drawFieldRow(
      doc,
      "Date de paiement",
      new Date(view.datePaiement).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }),
    );
    drawFieldRow(doc, "Mode de paiement", view.modeLibelle);
    drawFieldRow(doc, "Référence de paiement", view.paymentReference);
    if (view.numeroFicheProvisoire) {
      drawFieldRow(doc, "Fiche provisoire (FPC)", view.numeroFicheProvisoire);
    }

    if (qrPng) {
      doc.moveDown(0.6);
      const qrX = doc.page.width - doc.page.margins.right - 100;
      const qrY = doc.y;
      doc.image(qrPng, qrX, qrY, { width: 90 });
      doc.fontSize(7).fillColor("#6b7280").text("Vérification QR", qrX, qrY + 94, { width: 90, align: "center" });
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor("#6b7280").text(
      "Ce document atteste le règlement de la caution. La référence de paiement est unique et obligatoire pour tout rapprochement comptable.",
      { align: "justify" },
    );

    doc.end();
  });
}

export async function sendCautionFicheDefinitiveEmail(
  view: CautionFicheDefinitiveView,
  pdf: Buffer,
): Promise<CautionFicheEmailResult> {
  const email = view.destinataireEmail?.trim();
  if (!email) {
    return { emailSent: false, emailSkippedReason: "Aucune adresse e-mail renseignée", destinataireEmail: null };
  }
  const subject = `LONACI — ${CAUTION_FICHE_DEFINITIVE_TITLE} (${view.numeroFicheDefinitive})`;
  const text = [
    "Bonjour,",
    "",
    "Veuillez trouver ci-joint votre fiche de paiement de caution réglée.",
    "",
    `Document : ${view.numeroFicheDefinitive}`,
    `Montant payé : ${view.montantFCFA.toLocaleString("fr-FR")} FCFA`,
    `Référence de paiement : ${view.paymentReference}`,
    `Date de paiement : ${new Date(view.datePaiement).toLocaleString("fr-FR")}`,
    "",
    "— LONACI (transmission automatique)",
  ].join("\n");

  const result = await sendSmtpEmail([email], subject, text, {
    attachments: [
      {
        filename: `${view.numeroFicheDefinitive}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });
  return {
    emailSent: result.sent,
    emailSkippedReason: result.skippedReason,
    destinataireEmail: email,
  };
}

/** Génère le PDF officiel et tente l’envoi SMTP au concessionnaire / client si e-mail connu. */
export async function deliverCautionFicheDefinitive(cautionId: string): Promise<CautionFicheEmailResult | null> {
  const view = await buildCautionFicheDefinitiveView(cautionId);
  if (!view) return null;
  const pdf = await renderCautionFicheDefinitivePdf(view);
  return sendCautionFicheDefinitiveEmail(view, pdf);
}
