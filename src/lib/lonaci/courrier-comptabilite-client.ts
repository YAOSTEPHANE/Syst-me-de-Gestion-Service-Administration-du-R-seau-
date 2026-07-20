import "server-only";

import PDFDocument from "pdfkit";

import { ObjectId } from "mongodb";

import {
  buildCautionFicheDefinitiveView,
  type CautionFicheDefinitiveView,
} from "@/lib/lonaci/caution-fiche-definitive";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import type { CautionDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import {
  COURRIER_COMPTABILITE_OBJET,
  COURRIER_COMPTABILITE_TITLE,
  cautionEligibleCourrierComptabilite,
} from "@/lib/lonaci/courrier-comptabilite-constants";
import { CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL } from "@/lib/lonaci/caution-fiche-provisoire-constants";
import { assertDossierPartyReadable, contratPartyFromDossier } from "@/lib/lonaci/dossier-contrat-party";
import { findDossierById } from "@/lib/lonaci/dossiers";
import { resolveDossierCautionsStatus } from "@/lib/lonaci/dossier-produits";
import type { UserDocument } from "@/lib/lonaci/types";

export {
  COURRIER_COMPTABILITE_DESCRIPTION,
  COURRIER_COMPTABILITE_OBJET,
  COURRIER_COMPTABILITE_TITLE,
  cautionEligibleCourrierComptabilite,
} from "@/lib/lonaci/courrier-comptabilite-constants";

export interface CourrierComptabiliteClientView {
  referenceCourrier: string;
  generatedAt: Date;
  datePaiement: Date;
  destinataireComptabilite: string;
  nomComplet: string;
  raisonSociale: string;
  clientCode: string | null;
  codePdv: string | null;
  agenceLabel: string;
  produitCode: string;
  produitLibelle: string | null;
  montantFCFA: number;
  modeLibelle: string;
  paymentReference: string;
  numeroFicheDefinitive: string;
  numeroFicheProvisoire: string | null;
  dossierReference: string | null;
  etabliParAgence: string;
}

function referenceCourrierFromFiche(numeroFicheDefinitive: string): string {
  return `CCOM-${numeroFicheDefinitive.trim()}`;
}

function viewFromCautionFiche(
  fiche: CautionFicheDefinitiveView,
  options?: { dossierReference?: string | null; codePdv?: string | null; raisonSociale?: string },
): CourrierComptabiliteClientView {
  const raisonSociale = options?.raisonSociale?.trim() || fiche.identiteDetail.trim() || "—";
  const codePdv = options?.codePdv?.trim() || fiche.clientCode?.trim() || null;
  return {
    referenceCourrier: referenceCourrierFromFiche(fiche.numeroFicheDefinitive),
    generatedAt: new Date(),
    datePaiement: new Date(fiche.datePaiement),
    destinataireComptabilite: raisonSociale,
    nomComplet: fiche.identiteDetail,
    raisonSociale,
    clientCode: fiche.clientCode,
    codePdv,
    agenceLabel: fiche.agenceLabel,
    produitCode: fiche.produitCode,
    produitLibelle: fiche.produitLibelle,
    montantFCFA: fiche.montantFCFA,
    modeLibelle: fiche.modeLibelle,
    paymentReference: fiche.paymentReference,
    numeroFicheDefinitive: fiche.numeroFicheDefinitive,
    numeroFicheProvisoire: fiche.numeroFicheProvisoire,
    dossierReference: options?.dossierReference?.trim() || null,
    etabliParAgence: fiche.agenceLabel,
  };
}

async function resolveCourrierPartyCodes(fiche: CautionFicheDefinitiveView): Promise<{
  codePdv: string | null;
  raisonSociale: string;
}> {
  if (fiche.lonaciClientId?.trim()) {
    const client = await findLonaciClientById(fiche.lonaciClientId.trim());
    return {
      codePdv: client?.code?.trim() || fiche.clientCode,
      raisonSociale: client?.raisonSociale?.trim() || fiche.identiteDetail,
    };
  }

  if (!ObjectId.isValid(fiche.cautionId)) {
    return { codePdv: null, raisonSociale: fiche.identiteDetail };
  }

  const db = await getDatabase();
  const caution = await db.collection<Omit<CautionDocument, "_id"> & { _id: ObjectId }>("cautions").findOne({
    _id: new ObjectId(fiche.cautionId),
    deletedAt: null,
  });
  const pdvId = caution?.concessionnaireId?.trim();
  if (pdvId) {
    const conc = await findConcessionnaireById(pdvId);
    return {
      codePdv: conc?.codePdv?.trim() || null,
      raisonSociale: conc?.raisonSociale?.trim() || conc?.nomComplet?.trim() || fiche.identiteDetail,
    };
  }

  return { codePdv: null, raisonSociale: fiche.identiteDetail };
}

export async function buildCourrierComptabiliteFromCautionId(
  cautionId: string,
  dossierReference?: string | null,
): Promise<CourrierComptabiliteClientView | null> {
  const fiche = await buildCautionFicheDefinitiveView(cautionId);
  if (!fiche || !cautionEligibleCourrierComptabilite(fiche.numeroFicheDefinitive)) {
    return null;
  }

  const party = await resolveCourrierPartyCodes(fiche);
  return viewFromCautionFiche(fiche, {
    dossierReference,
    codePdv: party.codePdv,
    raisonSociale: party.raisonSociale,
  });
}

export async function buildCourrierComptabiliteFromDossierId(
  dossierId: string,
  _actor: UserDocument,
): Promise<CourrierComptabiliteClientView | null> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt || dossier.type !== "CONTRAT_ACTUALISATION") {
    return null;
  }

  const party = contratPartyFromDossier(dossier);
  if (!party) return null;

  const cautionsStatus = await resolveDossierCautionsStatus(dossier);
  if (!cautionsStatus.allPaid) return null;

  const primaryLink = cautionsStatus.links.find((l) => l.cautionId) ?? cautionsStatus.links[0];
  const cautionId = primaryLink?.cautionId?.trim();
  if (!cautionId) return null;

  return buildCourrierComptabiliteFromCautionId(cautionId, dossier.reference);
}

export async function assertCourrierComptabiliteDossierReadable(
  dossierId: string,
  actor: UserDocument,
): Promise<{ dossierReference: string } | null> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt) return null;
  const party = contratPartyFromDossier(dossier);
  if (!party) return null;
  await assertDossierPartyReadable(party, actor);
  return { dossierReference: dossier.reference };
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
  doc.fontSize(7).text("Document officiel — transmission comptabilité client", x + 14, topY + 38);
  doc.restore();
  doc.y = topY + bandH + 14;
  doc.fillColor("#111827").fontSize(12).text(COURRIER_COMPTABILITE_TITLE, { align: "center" });
  doc.moveDown(0.8);
}

function drawFieldRow(doc: InstanceType<typeof PDFDocument>, label: string, value: string) {
  const y = doc.y;
  doc.fontSize(9).fillColor("#6b7280").text(label, doc.page.margins.left, y, { width: 175 });
  doc.fontSize(10).fillColor("#111827").text(value, doc.page.margins.left + 180, y, {
    width: doc.page.width - doc.page.margins.right - doc.page.margins.left - 185,
    align: "right",
  });
  doc.moveDown(0.5);
}

export async function renderCourrierComptabiliteClientPdf(view: CourrierComptabiliteClientView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawPdfHeader(doc);

    const dateStr = view.generatedAt.toLocaleDateString("fr-FR", { dateStyle: "long" });
    doc.fontSize(9).fillColor("#374151").text(`Réf. courrier : ${view.referenceCourrier}`, { align: "right" });
    doc.text(`Abidjan, le ${dateStr}`, { align: "right" });
    doc.moveDown(1.2);

    doc.fontSize(10).fillColor("#111827").text("À l'attention de", { underline: true });
    doc.moveDown(0.25);
    doc.fontSize(11).text("Madame, Monsieur le Responsable de la Comptabilité");
    doc.fontSize(10).fillColor("#374151").text(view.destinataireComptabilite);
    doc.moveDown(1);

    doc.fontSize(10).fillColor("#111827").text(`Objet : ${COURRIER_COMPTABILITE_OBJET}`, { underline: true });
    doc.moveDown(0.8);

    doc
      .fontSize(10)
      .fillColor("#111827")
      .text("Madame, Monsieur,", { align: "left" });
    doc.moveDown(0.5);

    const produitLabel = view.produitLibelle
      ? `${view.produitCode} — ${view.produitLibelle}`
      : view.produitCode;

    doc
      .fontSize(10)
      .fillColor("#374151")
      .text(
        `Nous avons l'honneur de confirmer, pour les besoins de votre comptabilité, le règlement de la caution concessionnaire LONACI effectué par ${view.nomComplet}${view.raisonSociale !== view.nomComplet ? ` (${view.raisonSociale})` : ""}, conformément aux conditions d'attribution du produit ${produitLabel}.`,
        { align: "justify" },
      );
    doc.moveDown(0.6);
    doc.text(
      "Le présent courrier est remis au concessionnaire pour transmission à son service comptable, afin de permettre l'enregistrement comptable du paiement ci-dessous.",
      { align: "justify" },
    );

    doc.moveDown(0.8);
    doc.fontSize(10).fillColor("#111827").text("Détail du règlement", { underline: true });
    doc.moveDown(0.4);

    drawFieldRow(doc, "Concessionnaire / client", view.nomComplet);
    if (view.clientCode) drawFieldRow(doc, "Code client", view.clientCode);
    if (view.codePdv) drawFieldRow(doc, "Point de vente (PDV)", view.codePdv);
    drawFieldRow(doc, CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL, view.agenceLabel);
    drawFieldRow(doc, "Produit", produitLabel);
    drawFieldRow(doc, "Montant réglé (FCFA)", view.montantFCFA.toLocaleString("fr-FR"));
    drawFieldRow(
      doc,
      "Date de paiement",
      view.datePaiement.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }),
    );
    drawFieldRow(doc, "Mode de règlement", view.modeLibelle);
    drawFieldRow(doc, "Référence de paiement", view.paymentReference);
    drawFieldRow(doc, "Fiche définitive caution", view.numeroFicheDefinitive);
    if (view.numeroFicheProvisoire) {
      drawFieldRow(doc, "Fiche provisoire (FPC)", view.numeroFicheProvisoire);
    }
    if (view.dossierReference) {
      drawFieldRow(doc, "Réf. dossier contrat", view.dossierReference);
    }

    doc.moveDown(1.2);
    doc
      .fontSize(10)
      .fillColor("#374151")
      .text(
        "Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.",
        { align: "justify" },
      );

    doc.moveDown(2);
    const sigY = doc.y;
    doc.fontSize(9).fillColor("#6b7280").text("Pour la LONACI", doc.page.margins.left, sigY);
    doc.fontSize(10).fillColor("#111827").text(view.etabliParAgence, doc.page.margins.left, sigY + 14);
    doc
      .moveTo(doc.page.margins.left, sigY + 48)
      .lineTo(doc.page.margins.left + 200, sigY + 48)
      .strokeColor("#cbd5e1")
      .stroke();
    doc.fontSize(8).fillColor("#6b7280").text("Cachet et signature", doc.page.margins.left, sigY + 52);

    doc.moveDown(3.5);
    doc
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        "Document à conserver par le concessionnaire et à transmettre à son service comptable. La référence de paiement est obligatoire pour tout rapprochement.",
        { align: "justify" },
      );

    doc.end();
  });
}
