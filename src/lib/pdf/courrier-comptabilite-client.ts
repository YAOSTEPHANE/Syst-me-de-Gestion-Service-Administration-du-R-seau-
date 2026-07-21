import { CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL } from "@/lib/lonaci/caution-fiche-provisoire-constants";
import {
  COURRIER_COMPTABILITE_OBJET,
  COURRIER_COMPTABILITE_TITLE,
} from "@/lib/lonaci/courrier-comptabilite-constants";
import type { CourrierComptabiliteClientView } from "@/lib/lonaci/courrier-comptabilite-client";
import {
  collectPdfBuffer,
  contentWidth,
  createPremiumPdfDocument,
  finalizePremiumPages,
  type PdfDocument,
} from "@/lib/pdf/document";
import {
  drawInformationCard,
  drawSection,
  drawSignatureBlock,
  drawTitle,
  ensureSpace,
} from "@/lib/pdf/primitives";
import { PDF_COLORS, PDF_SPACING, PDF_TYPOGRAPHY } from "@/lib/pdf/tokens";

function drawParagraph(doc: PdfDocument, text: string): void {
  const width = contentWidth(doc);
  doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.body);
  const height = doc.heightOfString(text, { width, align: "justify" });
  ensureSpace(doc, height + PDF_SPACING.md);
  doc.fillColor(PDF_COLORS.ink).text(text, { width, align: "justify" });
  doc.y += PDF_SPACING.md;
}

export async function renderPremiumCourrierComptabiliteClientPdf(
  view: CourrierComptabiliteClientView,
): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    metadata: {
      title: COURRIER_COMPTABILITE_TITLE,
      subject: COURRIER_COMPTABILITE_OBJET,
      keywords: ["LONACI", "comptabilité", "caution", "attestation"],
      creationDate: view.generatedAt,
    },
  });
  const productLabel = view.produitLibelle
    ? `${view.produitCode} — ${view.produitLibelle}`
    : view.produitCode;

  return collectPdfBuffer(doc, () => {
    drawTitle(doc, COURRIER_COMPTABILITE_TITLE, `Réf. courrier : ${view.referenceCourrier}`);

    doc
      .fillColor(PDF_COLORS.ink)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.body)
      .text(
        `Abidjan, le ${view.generatedAt.toLocaleDateString("fr-FR", {
          dateStyle: "long",
        })}`,
        { align: "right" },
      );
    doc.y += PDF_SPACING.lg;

    drawSection(doc, "À l’attention de");
    drawInformationCard(doc, [
      {
        label: "Destinataire",
        value: "Madame, Monsieur le Responsable de la Comptabilité",
      },
      { label: "Organisation", value: view.destinataireComptabilite },
    ]);

    drawSection(doc, `Objet : ${COURRIER_COMPTABILITE_OBJET}`);
    drawParagraph(doc, "Madame, Monsieur,");
    drawParagraph(
      doc,
      `Nous avons l'honneur de confirmer, pour les besoins de votre comptabilité, le règlement de la caution concessionnaire LONACI effectué par ${view.nomComplet}${view.raisonSociale !== view.nomComplet ? ` (${view.raisonSociale})` : ""}, conformément aux conditions d'attribution du produit ${productLabel}.`,
    );
    drawParagraph(
      doc,
      "Le présent courrier est remis au concessionnaire pour transmission à son service comptable, afin de permettre l'enregistrement comptable du paiement ci-dessous.",
    );

    drawSection(doc, "Détail du règlement");
    const paymentFields = [
      { label: "Concessionnaire / client", value: view.nomComplet },
    ];
    if (view.clientCode) {
      paymentFields.push({ label: "Code client", value: view.clientCode });
    }
    if (view.codePdv) {
      paymentFields.push({ label: "Point de vente (PDV)", value: view.codePdv });
    }
    paymentFields.push(
      { label: CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL, value: view.agenceLabel },
      { label: "Produit", value: productLabel },
      {
        label: "Montant réglé (FCFA)",
        value: view.montantFCFA.toLocaleString("fr-FR"),
      },
      {
        label: "Date de paiement",
        value: view.datePaiement.toLocaleString("fr-FR", {
          dateStyle: "long",
          timeStyle: "short",
        }),
      },
      { label: "Mode de règlement", value: view.modeLibelle },
      { label: "Référence de paiement", value: view.paymentReference },
      { label: "Fiche définitive caution", value: view.numeroFicheDefinitive },
    );
    if (view.numeroFicheProvisoire) {
      paymentFields.push({
        label: "Fiche provisoire (FPC)",
        value: view.numeroFicheProvisoire,
      });
    }
    if (view.dossierReference) {
      paymentFields.push({
        label: "Réf. dossier contrat",
        value: view.dossierReference,
      });
    }
    drawInformationCard(doc, paymentFields);

    drawParagraph(
      doc,
      "Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.",
    );
    drawSignatureBlock(doc, [
      {
        label: "Pour la LONACI",
        name: view.etabliParAgence,
        footerLabel: "Cachet et signature",
      },
    ]);

    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.small)
      .text(
        "Document à conserver par le concessionnaire et à transmettre à son service comptable. La référence de paiement est obligatoire pour tout rapprochement.",
        { align: "justify" },
      );

    finalizePremiumPages(doc, {
      reference: view.referenceCourrier,
      issuedAt: view.generatedAt,
      documentLabel: "COURRIER · COMPTABILITÉ CLIENT",
    });
  });
}
