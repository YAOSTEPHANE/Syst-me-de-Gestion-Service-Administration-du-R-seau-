import {
  formatSoumissionPaiementMontant,
  SOUMISSION_FICHE_PAIEMENT_TITLE,
  SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA,
} from "@/lib/lonaci/soumission-paiement-constants";
import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  finalizePremiumPages,
} from "@/lib/pdf/document";
import {
  drawFieldRow,
  drawInformationCard,
  drawSection,
  drawSignatureBlock,
  drawStatusBadge,
  drawTitle,
} from "@/lib/pdf/primitives";
import { PDF_COLORS, PDF_SPACING, PDF_TYPOGRAPHY } from "@/lib/pdf/tokens";

export type SoumissionFichePaiementView = {
  reference: string;
  nomComplet: string;
  contact: string;
  typeDistributeurLabel: string;
  nombreTpe: number;
  agenceLabel: string;
  montantFCFA: number;
  agentNom: string;
  generatedAt: string;
  observations: string | null;
};

export async function renderSoumissionFichePaiementPdf(
  view: SoumissionFichePaiementView,
): Promise<Buffer> {
  const issuedAt = new Date(view.generatedAt);
  const montant =
    view.montantFCFA > 0 ? view.montantFCFA : SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA;

  const doc = createPremiumPdfDocument({
    metadata: {
      title: SOUMISSION_FICHE_PAIEMENT_TITLE,
      subject: `Paiement caisse ${formatSoumissionPaiementMontant(montant)}`,
      author: view.agentNom,
      keywords: ["LONACI", "soumission", "paiement", "caisse"],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      SOUMISSION_FICHE_PAIEMENT_TITLE,
      `Référence : ${view.reference} · Émis le ${issuedAt.toLocaleString("fr-FR", {
        dateStyle: "long",
        timeStyle: "short",
      })}`,
    );
    drawStatusBadge(doc, "À RÉGLER À LA CAISSE", "warning");

    drawSection(doc, "Identité du contact");
    drawInformationCard(doc, [
      { label: "Nom complet", value: view.nomComplet },
      { label: "Contact", value: view.contact },
      { label: "Type de distributeur", value: view.typeDistributeurLabel },
      { label: "Nombre de TPE", value: String(view.nombreTpe) },
      { label: "Agence", value: view.agenceLabel },
    ]);

    drawSection(doc, "Paiement à la caisse");
    drawFieldRow(doc, {
      label: "Montant à payer",
      value: formatSoumissionPaiementMontant(montant),
    });
    drawFieldRow(doc, {
      label: "Lieu de règlement",
      value: "Caisse LONACI",
    });
    if (view.observations?.trim()) {
      drawFieldRow(doc, {
        label: "Observation",
        value: view.observations.trim(),
      });
    }
    doc.y += PDF_SPACING.md;

    drawSection(doc, "Agent émetteur");
    drawInformationCard(doc, [
      { label: "Générée par", value: view.agentNom },
      {
        label: "Date / heure",
        value: issuedAt.toLocaleString("fr-FR", {
          dateStyle: "long",
          timeStyle: "short",
        }),
      },
    ]);

    doc.y += PDF_SPACING.lg;
    drawSignatureBlock(doc, [
      {
        label: "Visa agent",
        name: view.agentNom,
        role: "Agent LONACI",
        dateLabel: issuedAt.toLocaleDateString("fr-FR"),
        footerLabel: "Signature et cachet",
      },
      {
        label: "Visa caisse",
        role: "Caissier(ère)",
        footerLabel: "Signature et cachet",
      },
    ]);

    doc.y += PDF_SPACING.md;
    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(
        "Présentez cette fiche à la caisse pour le règlement. Elle ne vaut pas quittance tant que le paiement n’est pas enregistré.",
        { align: "justify" },
      );

    finalizePremiumPages(doc, {
      reference: view.reference,
      issuedAt,
      documentLabel: "SOUMISSION · FICHE PAIEMENT CAISSE",
      generatedBy: view.agentNom,
    });
  });
}
