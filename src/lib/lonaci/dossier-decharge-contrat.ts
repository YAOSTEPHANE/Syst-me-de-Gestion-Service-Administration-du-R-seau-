import "server-only";

import {
  DECHARGE_CONTRAT_MENTION,
  DECHARGE_CONTRAT_TITLE,
  dossierEligibleDechargeContratRemise,
} from "@/lib/lonaci/dossier-decharge-constants";
import { parseContratsGeneresPayload, referenceAnnexeFromContrat } from "@/lib/lonaci/contrat-document";
import { loadPartySnapshotForDossier } from "@/lib/lonaci/contrat-party-snapshot";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";
import { findDossierById } from "@/lib/lonaci/dossiers";
import type { DossierDocument, UserDocument } from "@/lib/lonaci/types";
import { userDisplayName } from "@/lib/lonaci/types";
import { findUserById } from "@/lib/lonaci/users";
import {
  collectPdfBuffer,
  contentWidth,
  createPremiumPdfDocument,
  drawBulletList,
  drawInformationCard,
  drawSection,
  drawSignatureBlock,
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
  etabliPar: string;
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
    etabliPar,
  };
}

export async function renderDossierDechargeContratPdf(view: DossierDechargeContratView): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    metadata: {
      title: DECHARGE_CONTRAT_TITLE,
      subject: `Remise des contrats du dossier ${view.dossierReference}`,
      creationDate: view.generatedAt,
    },
  });
  return collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      DECHARGE_CONTRAT_TITLE,
      `Réf. dossier : ${view.dossierReference} · Date : ${view.dateRemise.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`,
    );
    drawStatusBadge(doc, view.mention, "info");

    const identityFields: PdfField[] = [
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
            : `${view.produits.length.toLocaleString("fr-FR")} produits — voir la liste détaillée ci-dessous`,
      },
      { label: "Établi par", value: view.etabliPar },
    ];
    drawSection(doc, "Identification du bénéficiaire");
    drawInformationCard(doc, identityFields);

    drawSection(doc, "Contrat(s) remis au client");
    drawBulletList(
      doc,
      view.produits.map(
        (produit) =>
          `${produit.produitCode} — ${produit.produitLibelle}\nContrat : ${produit.referenceContrat} | Annexe : ${produit.referenceAnnexe}`,
      ),
    );

    drawSection(doc, "Attestation de remise");
    const attestation = `Je soussigné(e) reconnais avoir reçu le(s) contrat(s) et annexe(s) mentionné(s) ci-dessus, relatifs au point de vente ${view.codePdv || "—"} (${view.agenceLabel}), en date du ${view.dateRemise.toLocaleDateString("fr-FR", { dateStyle: "long" })}.`;
    doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.body);
    const attestationHeight =
      doc.heightOfString(attestation, { width: contentWidth(doc) }) + PDF_SPACING.lg;
    ensureSpace(doc, attestationHeight);
    doc
      .fillColor(PDF_COLORS.ink)
      .text(attestation, { width: contentWidth(doc), align: "justify" });
    doc.y += PDF_SPACING.lg;
    drawSignatureBlock(doc, [
      { label: "Signature du client" },
      { label: "Cachet et signature LONACI" },
    ]);

    const retentionNotice =
      "Document établi après finalisation du contrat. À conserver par le client et par l’agence.";
    doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.label);
    ensureSpace(
      doc,
      doc.heightOfString(retentionNotice, { width: contentWidth(doc) }) + PDF_SPACING.md,
    );
    doc
      .fillColor(PDF_COLORS.muted)
      .text(retentionNotice, { width: contentWidth(doc), align: "justify" });

    finalizePremiumPages(doc, {
      reference: view.dossierReference,
      issuedAt: view.generatedAt,
      documentLabel: "REMISE DE CONTRAT",
    });
  });
}
