import "server-only";

import { ObjectId } from "mongodb";

import {
  DECHARGE_DEFINITIVE_MENTION,
  DECHARGE_DEFINITIVE_TITLE,
  dossierEligibleDechargeDefinitive,
} from "@/lib/lonaci/dossier-decharge-constants";
import { resolveDocumentAgentName } from "@/lib/lonaci/document-agent";
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
  UserDocument,
} from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import {
  collectPdfBuffer,
  contentBottom,
  contentWidth,
  createPremiumPdfDocument,
  drawStatusBadge,
  finalizePremiumPages,
  PDF_SPACING,
  type PdfField,
} from "@/lib/pdf";
import {
  CHEF_SERVICE_PDF_SIGNATURE,
  COMPACT_LABEL_SIZE,
  COMPACT_LINE_HEIGHT,
  COMPACT_SIGNATURE_BOX_HEIGHT,
  COMPACT_TITLE_HEIGHT,
  COMPACT_VALUE_SIZE,
  drawCompactBlockTitle,
  drawCompactFieldGrid,
  drawCompactFootnote,
  drawCompactHeader,
  drawCompactSignatureBoxes,
  fitCompactList,
} from "@/lib/pdf/compact-layout";
import { FICHE_MARGINS } from "@/lib/pdf/soumission-fiche-paiement";
import { PDF_PREMIUM } from "@/lib/pdf/tokens";

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
  agentNom: string;
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
  actor?: UserDocument | null,
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
  const agentNom = await resolveDocumentAgentName({ actor });

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
    agentNom,
  };
}

export async function renderDossierDechargeDefinitivePdf(view: DossierDechargeDefinitiveView): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    margins: FICHE_MARGINS,
    metadata: {
      title: DECHARGE_DEFINITIVE_TITLE,
      subject: `Décharge définitive du dossier ${view.dossierReference}`,
      author: view.agentNom,
      creationDate: view.generatedAt,
    },
  });
  return collectPdfBuffer(doc, () => {
    const left = doc.page.margins.left;
    const width = contentWidth(doc);
    drawCompactHeader(
      doc,
      DECHARGE_DEFINITIVE_TITLE,
      `Réf. dossier : ${view.dossierReference} · Date de validation : ${view.dateValidation.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`,
    );
    drawStatusBadge(doc, view.mention, "success");

    const identityFields: PdfField[] = [
      { label: "Nom complet", value: view.nomComplet },
      { label: "Raison sociale", value: view.raisonSociale },
      { label: "Code PDV", value: view.codePdv },
      ...(view.codeTerminal ? [{ label: "Code terminal", value: view.codeTerminal }] : []),
      ...(view.codeConcessionnaire
        ? [{ label: "N° Distributeur", value: view.codeConcessionnaire }]
        : []),
      ...(view.cniNumero ? [{ label: "N° CNI", value: view.cniNumero }] : []),
      ...(view.email ? [{ label: "E-mail", value: view.email }] : []),
      ...(view.telephone ? [{ label: "Téléphone", value: view.telephone }] : []),
      ...(view.adresse ? [{ label: "Adresse", value: view.adresse }] : []),
      ...(view.ville ? [{ label: "Ville", value: view.ville }] : []),
      { label: "Agence", value: view.agenceLabel },
      { label: "Produit", value: `${view.produitCode} — ${view.produitLibelle}` },
    ];
    drawCompactFieldGrid(doc, "Identification", identityFields);

    const cautionFields: PdfField[] = [
      { label: "Réf. caution", value: view.cautionReferenceLabel },
      { label: "Montant (FCFA)", value: view.cautionMontantFCFA.toLocaleString("fr-FR") },
      {
        label: "Date de paiement",
        value: view.cautionPaidAt.toLocaleString("fr-FR", {
          dateStyle: "long",
          timeStyle: "short",
        }),
      },
      ...(view.numeroFicheProvisoire
        ? [{ label: "Fiche provisoire (FPC)", value: view.numeroFicheProvisoire }]
        : []),
      ...(view.numeroFicheDefinitive
        ? [{ label: "Fiche définitive (FPD)", value: view.numeroFicheDefinitive }]
        : []),
      { label: "Référence de paiement", value: view.paymentReference },
    ];
    drawCompactFieldGrid(doc, "Caution réglée", cautionFields);

    const legalNotice =
      "Ce document atteste la complétude du dossier et le règlement de la caution. La référence de paiement est unique et obligatoire pour tout rapprochement comptable.";
    doc.font("Helvetica").fontSize(COMPACT_LABEL_SIZE);
    const noticeHeight = doc.heightOfString(legalNotice, { width });
    const reservedBelowList =
      noticeHeight + PDF_SPACING.sm + COMPACT_SIGNATURE_BOX_HEIGHT + COMPACT_LINE_HEIGHT + PDF_SPACING.md;
    const listBudget = Math.max(
      COMPACT_LINE_HEIGHT,
      contentBottom(doc) - doc.y - COMPACT_TITLE_HEIGHT - PDF_SPACING.sm - reservedBelowList,
    );

    drawCompactBlockTitle(doc, "Documents fournis et validés");
    doc.fillColor(PDF_PREMIUM.inkSoft).font("Helvetica").fontSize(COMPACT_VALUE_SIZE);
    const documentsText = view.documentsFournis.length
      ? fitCompactList(doc, view.documentsFournis, {
          separator: " · ",
          width,
          maxHeight: listBudget,
          emptySummary: `${view.documentsFournis.length} document(s) — voir le dossier`,
        })
      : "Aucun document listé.";
    doc.text(documentsText, left, doc.y, { width, align: "justify" });
    doc.y += PDF_SPACING.sm;

    doc
      .fillColor(PDF_PREMIUM.muted)
      .font("Helvetica")
      .fontSize(COMPACT_LABEL_SIZE)
      .text(legalNotice, left, doc.y, { width, align: "justify" });
    doc.y += PDF_SPACING.sm;

    drawCompactSignatureBoxes(doc, [CHEF_SERVICE_PDF_SIGNATURE]);
    drawCompactFootnote(doc, `Générée par : ${view.agentNom}`);

    finalizePremiumPages(doc, {
      reference: view.dossierReference,
      issuedAt: view.generatedAt,
      documentLabel: "DÉCHARGE DÉFINITIVE",
      generatedBy: view.agentNom,
    });
  });
}
