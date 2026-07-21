import "server-only";

import { ObjectId } from "mongodb";

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
} from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import {
  collectPdfBuffer,
  contentWidth,
  createPremiumPdfDocument,
  drawBulletList,
  drawInformationCard,
  drawSection,
  drawStatusBadge,
  drawTitle,
  ensureSpace,
  finalizePremiumPages,
  PDF_COLORS,
  PDF_SPACING,
  PDF_TYPOGRAPHY,
  type PdfField,
} from "@/lib/pdf";

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

export async function renderDossierDechargeDefinitivePdf(view: DossierDechargeDefinitiveView): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    metadata: {
      title: DECHARGE_DEFINITIVE_TITLE,
      subject: `Décharge définitive du dossier ${view.dossierReference}`,
      creationDate: view.generatedAt,
    },
  });
  return collectPdfBuffer(doc, () => {
    drawTitle(
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
        ? [{ label: "Code concessionnaire", value: view.codeConcessionnaire }]
        : []),
      ...(view.cniNumero ? [{ label: "N° CNI", value: view.cniNumero }] : []),
      ...(view.email ? [{ label: "E-mail", value: view.email }] : []),
      ...(view.telephone ? [{ label: "Téléphone", value: view.telephone }] : []),
      ...(view.adresse ? [{ label: "Adresse", value: view.adresse }] : []),
      ...(view.ville ? [{ label: "Ville", value: view.ville }] : []),
      { label: "Agence", value: view.agenceLabel },
      { label: "Produit", value: `${view.produitCode} — ${view.produitLibelle}` },
    ];
    drawSection(doc, "Identification");
    drawInformationCard(doc, identityFields);

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
    drawSection(doc, "Caution réglée");
    drawInformationCard(doc, cautionFields);

    drawSection(doc, "Documents fournis et validés");
    drawBulletList(doc, view.documentsFournis, "Aucun document listé.");

    const legalNotice =
      "Ce document atteste la complétude du dossier et le règlement de la caution. La référence de paiement est unique et obligatoire pour tout rapprochement comptable.";
    doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.label);
    const noticeHeight =
      doc.heightOfString(legalNotice, { width: contentWidth(doc) }) + PDF_SPACING.md;
    ensureSpace(doc, noticeHeight);
    doc
      .fillColor(PDF_COLORS.muted)
      .text(legalNotice, { width: contentWidth(doc), align: "justify" });

    finalizePremiumPages(doc, {
      reference: view.dossierReference,
      issuedAt: view.generatedAt,
      documentLabel: "DÉCHARGE DÉFINITIVE",
    });
  });
}
