import {
  CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL,
  CAUTION_FICHE_EN_ATTENTE_MENTION,
  CAUTION_FICHE_PROVISOIRE_TITLE,
} from "@/lib/lonaci/caution-fiche-provisoire-constants";
import type { CautionFicheProvisoireView } from "@/lib/lonaci/caution-fiche-provisoire";
import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  finalizePremiumPages,
} from "@/lib/pdf/document";
import {
  drawFieldRow,
  drawInformationCard,
  drawSection,
  drawStatusBadge,
  drawTitle,
  drawWatermark,
} from "@/lib/pdf/primitives";
import { PDF_COLORS, PDF_SPACING, PDF_TYPOGRAPHY } from "@/lib/pdf/tokens";

function formatAmount(value: number): string {
  return `${value.toLocaleString("fr-FR")} FCFA`;
}

function drawWatermarks(doc: ReturnType<typeof createPremiumPdfDocument>): void {
  const range = doc.bufferedPageRange();
  for (let offset = 0; offset < range.count; offset += 1) {
    doc.switchToPage(range.start + offset);
    drawWatermark(doc, CAUTION_FICHE_EN_ATTENTE_MENTION, { opacity: 0.12, angle: -35 });
  }
}

export async function renderPremiumCautionFicheProvisoirePdf(
  view: CautionFicheProvisoireView,
): Promise<Buffer> {
  const issuedAt = new Date(view.generatedAt);
  const dueDate = new Date(view.dueDate);
  const doc = createPremiumPdfDocument({
    metadata: {
      title: CAUTION_FICHE_PROVISOIRE_TITLE,
      subject: CAUTION_FICHE_EN_ATTENTE_MENTION,
      keywords: ["LONACI", "caution", "fiche provisoire"],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      CAUTION_FICHE_PROVISOIRE_TITLE,
      `Référence dossier : ${view.numeroDossier} · Émis le ${issuedAt.toLocaleString("fr-FR", {
        dateStyle: "long",
        timeStyle: "short",
      })}`,
    );
    drawStatusBadge(doc, CAUTION_FICHE_EN_ATTENTE_MENTION, "warning");

    drawSection(doc, "Titulaire et rattachement");
    const identityFields = [
      { label: "Identité", value: view.identiteDetail },
      {
        label: view.identifiantLabel,
        value: view.identifiantValue?.trim() || "—",
      },
    ];
    if (view.identiteLabel === "Client" || view.cniNumero?.trim()) {
      identityFields.push({ label: "N° CNI", value: view.cniNumero?.trim() || "—" });
    }
    identityFields.push({
      label: CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL,
      value: view.agenceLabel,
    });
    drawInformationCard(doc, identityFields);

    drawSection(doc, "Produit(s) et montant(s) de caution due");
    if (view.produitLignes.length === 0) {
      drawFieldRow(doc, {
        label: "Montant caution due",
        value: formatAmount(view.montantTotalFCFA),
      });
    } else {
      for (const line of view.produitLignes) {
        drawFieldRow(doc, {
          label: line.libelle,
          value: `${formatAmount(line.montantFCFA)} (${line.code})`,
        });
      }
      drawFieldRow(doc, {
        label: "Total caution due",
        value: formatAmount(view.montantTotalFCFA),
      });
    }
    drawFieldRow(doc, {
      label: "Échéance indicative",
      value: dueDate.toLocaleDateString("fr-FR", { dateStyle: "long" }),
    });
    doc.y += PDF_SPACING.md;

    drawSection(doc, "Coordonnées bancaires LONACI");
    const bankFields = [
      { label: "Banque", value: view.bank.banque },
      { label: "Compte / RIB", value: view.bank.compte },
    ];
    if (view.bank.iban) {
      bankFields.push({ label: "IBAN", value: view.bank.iban });
    }
    bankFields.push({
      label: "Libellé virement",
      value: `${view.bank.libelleVirement} — ${view.numeroDossier}`,
    });
    drawInformationCard(doc, bankFields);

    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(
        "Ce document est une fiche provisoire : il ne vaut pas quittance de paiement. Conservez la référence dossier pour tout versement ou rapprochement.",
        { align: "justify" },
      );

    drawWatermarks(doc);
    finalizePremiumPages(doc, {
      reference: view.numeroDossier,
      issuedAt,
      documentLabel: "CAUTION · FICHE PROVISOIRE",
    });
  });
}
