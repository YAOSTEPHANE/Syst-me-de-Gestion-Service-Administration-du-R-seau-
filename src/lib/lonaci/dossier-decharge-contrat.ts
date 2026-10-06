import "server-only";

import {
  DECHARGE_CONTRAT_MENTION,
  DECHARGE_CONTRAT_TITLE,
  dossierEligibleDechargeContratRemise,
} from "@/lib/lonaci/dossier-decharge-constants";
import { parseContratsGeneresPayload, referenceAnnexeFromContrat } from "@/lib/lonaci/contrat-document";
import { loadPartySnapshotForDossier } from "@/lib/lonaci/contrat-party-snapshot";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";
import { resolveDocumentAgentName } from "@/lib/lonaci/document-agent";
import { findDossierById } from "@/lib/lonaci/dossiers";
import type { DossierDocument, UserDocument } from "@/lib/lonaci/types";
import { userDisplayName } from "@/lib/lonaci/types";
import { findUserById } from "@/lib/lonaci/users";
import {
  collectPdfBuffer,
  contentBottom,
  contentWidth,
  createPremiumPdfDocument,
  drawStatusBadge,
  finalizePremiumPages,
  PDF_SPACING,
} from "@/lib/pdf";
import {
  CHEF_SERVICE_PDF_SIGNATURE,
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
  DECHARGE_CONTRAT_DESCRIPTION,
  DECHARGE_CONTRAT_MENTION,
  DECHARGE_CONTRAT_TITLE,
  dossierEligibleDechargeContratRemise,
} from "@/lib/lonaci/dossier-decharge-constants";

export interface DechargeContratProduitRow {
  produitCode: string;
  produitLibelle: string;
  referenceContrat: string;
  referenceAnnexe: string;
}

export interface DossierDechargeContratView {
  dossierReference: string;
  generatedAt: Date;
  dateRemise: Date;
  mention: string;
  nomComplet: string;
  raisonSociale: string;
  codePdv: string;
  agenceLabel: string;
  produits: DechargeContratProduitRow[];
  agentNom: string;
}

async function resolveEtabliParLabel(dossier: DossierDocument, actor: UserDocument): Promise<string> {
  const finalized = [...dossier.history].reverse().find((h) => h.status === "FINALISE");
  if (finalized?.actedByUserId?.trim()) {
    const user = await findUserById(finalized.actedByUserId.trim());
    if (user) return userDisplayName(user);
  }
  return userDisplayName(actor);
}

function resolveDateRemise(dossier: DossierDocument): Date {
  const finalized = [...dossier.history].reverse().find((h) => h.status === "FINALISE");
  return finalized?.actedAt ?? dossier.updatedAt ?? new Date();
}

export async function buildDossierDechargeContratView(
  dossierId: string,
  actor: UserDocument,
  produitCodeFilter?: string,
): Promise<DossierDechargeContratView | null> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt || dossier.type !== "CONTRAT_ACTUALISATION") {
    return null;
  }

  const contratsGeneres = parseContratsGeneresPayload(dossier.payload ?? {});
  if (!dossierEligibleDechargeContratRemise(dossier.status, contratsGeneres.length > 0)) {
    return null;
  }

  const partySnapshot = await loadPartySnapshotForDossier(dossier);
  if (!partySnapshot) {
    return null;
  }

  const filter = produitCodeFilter?.trim().toUpperCase();
  const selected = filter
    ? contratsGeneres.filter((g) => g.produitCode.trim().toUpperCase() === filter)
    : contratsGeneres;
  if (!selected.length) {
    return null;
  }

  const produits: DechargeContratProduitRow[] = [];
  for (const genere of selected) {
    const produit = await resolveProduitForContratWorkflow(genere.produitCode);
    const referenceContrat =
      genere.contratSigneArchive?.contratReference?.trim() || genere.referenceContratPreview.trim();
    const referenceAnnexe =
      genere.annexeSigneArchive?.annexeReference?.trim() ||
      genere.referenceAnnexePreview.trim() ||
      referenceAnnexeFromContrat(referenceContrat);
    produits.push({
      produitCode: genere.produitCode,
      produitLibelle: produit?.libelle ?? genere.produitLibelle ?? genere.produitCode,
      referenceContrat,
      referenceAnnexe,
    });
  }

  const etabliPar = await resolveEtabliParLabel(dossier, actor);
  const agentNom = await resolveDocumentAgentName({
    persistedName: etabliPar,
    actor,
  });
  const dateRemise = resolveDateRemise(dossier);

  return {
    dossierReference: dossier.reference,
    generatedAt: new Date(),
    dateRemise,
    mention: DECHARGE_CONTRAT_MENTION,
    nomComplet: partySnapshot.nomComplet,
    raisonSociale: partySnapshot.raisonSociale,
    codePdv: partySnapshot.codePdv,
    agenceLabel: partySnapshot.agenceLabel,
    produits,
    agentNom,
  };
}

export async function renderDossierDechargeContratPdf(view: DossierDechargeContratView): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    margins: FICHE_MARGINS,
    metadata: {
      title: DECHARGE_CONTRAT_TITLE,
      subject: `Remise des contrats du dossier ${view.dossierReference}`,
      author: view.agentNom,
      creationDate: view.generatedAt,
    },
  });
  return collectPdfBuffer(doc, () => {
    const left = doc.page.margins.left;
    const width = contentWidth(doc);
    drawCompactHeader(
      doc,
      DECHARGE_CONTRAT_TITLE,
      `Réf. dossier : ${view.dossierReference} · Date de remise : ${view.dateRemise.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`,
    );
    drawStatusBadge(doc, view.mention, "info");

    drawCompactFieldGrid(doc, "Identification du bénéficiaire", [
      { label: "Nom", value: view.nomComplet },
      ...(view.raisonSociale && view.raisonSociale !== view.nomComplet
        ? [{ label: "Raison sociale", value: view.raisonSociale }]
        : []),
      { label: "Point de vente (PDV)", value: view.codePdv || "—" },
      { label: "Agence", value: view.agenceLabel },
      {
        label: "Produit",
        value:
          view.produits.length === 1
            ? `${view.produits[0]!.produitCode} — ${view.produits[0]!.produitLibelle}`
            : `${view.produits.length.toLocaleString("fr-FR")} produits — voir la liste ci-dessous`,
      },
    ]);

    const attestation = `Je soussigné(e) reconnais avoir reçu le(s) contrat(s) et annexe(s) mentionné(s) ci-dessus, relatifs au point de vente ${view.codePdv || "—"} (${view.agenceLabel}), en date du ${view.dateRemise.toLocaleDateString("fr-FR", { dateStyle: "long" })}.`;
    doc.font("Helvetica").fontSize(COMPACT_VALUE_SIZE);
    const attestationHeight = doc.heightOfString(attestation, { width });
    const reservedBelowList =
      COMPACT_TITLE_HEIGHT +
      attestationHeight +
      PDF_SPACING.sm +
      COMPACT_LINE_HEIGHT +
      COMPACT_SIGNATURE_BOX_HEIGHT +
      COMPACT_LINE_HEIGHT +
      PDF_SPACING.md;
    const listBudget = Math.max(
      COMPACT_LINE_HEIGHT,
      contentBottom(doc) - doc.y - COMPACT_TITLE_HEIGHT - reservedBelowList,
    );

    drawCompactBlockTitle(doc, "Contrat(s) remis au client");
    doc.fillColor(PDF_PREMIUM.inkSoft).font("Helvetica").fontSize(COMPACT_VALUE_SIZE);
    const produitsText = fitCompactList(
      doc,
      view.produits.map(
        (produit) =>
          `• ${produit.produitCode} — ${produit.produitLibelle} · Contrat : ${produit.referenceContrat} · Annexe : ${produit.referenceAnnexe}`,
      ),
      {
        separator: "\n",
        width,
        maxHeight: listBudget,
        emptySummary: `${view.produits.length} contrat(s) remis — voir le dossier`,
      },
    );
    doc.text(produitsText, left, doc.y, { width });
    doc.y += PDF_SPACING.sm;

    drawCompactBlockTitle(doc, "Attestation de remise");
    doc
      .fillColor(PDF_PREMIUM.ink)
      .font("Helvetica")
      .fontSize(COMPACT_VALUE_SIZE)
      .text(attestation, left, doc.y, { width, align: "justify" });
    doc.y += PDF_SPACING.xs;
    drawCompactFootnote(doc, "Document établi après finalisation du contrat. À conserver par le client et par l’agence.");
    doc.y += PDF_SPACING.sm;

    drawCompactSignatureBoxes(doc, [
      { label: "Signature du client", footerLabel: "Lu et approuvé" },
      CHEF_SERVICE_PDF_SIGNATURE,
    ]);
    drawCompactFootnote(doc, `Générée par : ${view.agentNom}`);

    finalizePremiumPages(doc, {
      reference: view.dossierReference,
      issuedAt: view.generatedAt,
      documentLabel: "DECHARGE CONTRAT",
      generatedBy: view.agentNom,
    });
  });
}
