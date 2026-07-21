import "server-only";

import { ObjectId } from "mongodb";
import QRCode from "qrcode";

import { sendSmtpEmail } from "@/lib/email/smtp";
import { CAUTION_FICHE_DEFINITIVE_TITLE } from "@/lib/lonaci/caution-fiche-definitive-constants";
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
import { renderPremiumCautionFicheDefinitivePdf } from "@/lib/pdf/caution-fiche-definitive";

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

export async function renderCautionFicheDefinitivePdf(view: CautionFicheDefinitiveView): Promise<Buffer> {
  const qrPng = await renderCautionFicheDefinitiveQrPng(view);
  return renderPremiumCautionFicheDefinitivePdf(view, qrPng);
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
