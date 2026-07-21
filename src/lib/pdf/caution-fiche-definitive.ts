import {
  CAUTION_FICHE_DEFINITIVE_TITLE,
  CAUTION_FICHE_PAYEE_MENTION,
} from "@/lib/lonaci/caution-fiche-definitive-constants";
import type { CautionFicheDefinitiveView } from "@/lib/lonaci/caution-fiche-definitive";
import { CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL } from "@/lib/lonaci/caution-fiche-provisoire-constants";
import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  finalizePremiumPages,
} from "@/lib/pdf/document";
import {
  drawInformationCard,
  drawQrBlock,
  drawSection,
  drawStatusBadge,
  drawTitle,
} from "@/lib/pdf/primitives";
import { PDF_COLORS, PDF_TYPOGRAPHY } from "@/lib/pdf/tokens";

export async function renderPremiumCautionFicheDefinitivePdf(
  view: CautionFicheDefinitiveView,
  qrPng: Buffer | null,
): Promise<Buffer> {
  const issuedAt = new Date(view.emiseLe);
  const paymentDate = new Date(view.datePaiement);
  const doc = createPremiumPdfDocument({
    metadata: {
      title: CAUTION_FICHE_DEFINITIVE_TITLE,
      subject: CAUTION_FICHE_PAYEE_MENTION,
      keywords: ["LONACI", "caution", "paiement", "fiche définitive"],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      CAUTION_FICHE_DEFINITIVE_TITLE,
      `Réf. document : ${view.numeroFicheDefinitive}`,
    );
    drawStatusBadge(doc, CAUTION_FICHE_PAYEE_MENTION, "success");

    drawSection(doc, "Titulaire et règlement");
    const fields = [{ label: "Identité", value: view.identiteDetail }];
    if (view.clientCode) {
      fields.push({ label: "Code client", value: view.clientCode });
    }
    if (view.contratId) {
      fields.push({ label: "Contrat", value: view.contratId });
    }
    fields.push(
      {
        label: "Produit",
        value: view.produitLibelle
          ? `${view.produitCode} — ${view.produitLibelle}`
          : view.produitCode,
      },
      { label: CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL, value: view.agenceLabel },
      {
        label: "Montant payé (FCFA)",
        value: view.montantFCFA.toLocaleString("fr-FR"),
      },
      {
        label: "Date de paiement",
        value: paymentDate.toLocaleString("fr-FR", {
          dateStyle: "long",
          timeStyle: "short",
        }),
      },
      { label: "Mode de paiement", value: view.modeLibelle },
      { label: "Référence de paiement", value: view.paymentReference },
    );
    if (view.numeroFicheProvisoire) {
      fields.push({
        label: "Fiche provisoire (FPC)",
        value: view.numeroFicheProvisoire,
      });
    }
    drawInformationCard(doc, fields);

    if (qrPng) {
      drawSection(doc, "Contrôle du document");
      drawQrBlock(doc, {
        label: "Vérification QR",
        description:
          "Scannez ce code pour contrôler l’identifiant de caution, la fiche définitive et la référence de paiement.",
        image: qrPng,
        size: 82,
      });
    }

    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(
        "Ce document atteste le règlement de la caution. La référence de paiement est unique et obligatoire pour tout rapprochement comptable.",
        { align: "justify" },
      );

    finalizePremiumPages(doc, {
      reference: view.numeroFicheDefinitive,
      issuedAt,
      documentLabel: "CAUTION · FICHE DÉFINITIVE",
    });
  });
}
