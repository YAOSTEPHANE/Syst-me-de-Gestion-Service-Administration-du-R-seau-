import {
  CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL,
  CAUTION_FICHE_EN_ATTENTE_MENTION,
  CAUTION_FICHE_ENREG_REFERENCE,
  CAUTION_FICHE_ENREG_VERSION,
  CAUTION_FICHE_PROVISOIRE_TITLE,
  CAUTION_FICHE_SIGNATURE_ROLE,
} from "@/lib/lonaci/caution-fiche-provisoire-constants";
import type { CautionFicheProvisoireView } from "@/lib/lonaci/caution-fiche-provisoire";
import { montantFcfaEnLettres } from "@/lib/lonaci/montant-en-lettres";
import {
  collectPdfBuffer,
  contentWidth,
  createPremiumPdfDocument,
  finalizePremiumPages,
} from "@/lib/pdf/document";
import {
  drawSignatureBlock,
  drawWatermark,
  ensureSpace,
} from "@/lib/pdf/primitives";
import { PDF_COLORS, PDF_SPACING, PDF_TYPOGRAPHY } from "@/lib/pdf/tokens";

function formatAmount(value: number): string {
  if (!value) return "—";
  return `${value.toLocaleString("fr-FR")} FCFA`;
}

function drawWatermarks(doc: ReturnType<typeof createPremiumPdfDocument>): void {
  const range = doc.bufferedPageRange();
  for (let offset = 0; offset < range.count; offset += 1) {
    doc.switchToPage(range.start + offset);
    drawWatermark(doc, CAUTION_FICHE_EN_ATTENTE_MENTION, { opacity: 0.1, angle: -35 });
  }
}

function drawEnregHeader(
  doc: ReturnType<typeof createPremiumPdfDocument>,
  view: CautionFicheProvisoireView,
): void {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const issuedAt = new Date(view.generatedAt);
  ensureSpace(doc, 58);
  const y = doc.y;
  doc.save();
  doc.roundedRect(left, y, width, 52, 4).lineWidth(0.8).strokeColor(PDF_COLORS.border).stroke();
  doc
    .fillColor(PDF_COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(PDF_TYPOGRAPHY.small)
    .text("ENREGISTREMENT", left + 8, y + 6, { width: width - 16, lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(PDF_TYPOGRAPHY.small)
    .fillColor(PDF_COLORS.muted)
    .text(`Référence : ${CAUTION_FICHE_ENREG_REFERENCE}`, left + 8, y + 20, {
      width: width * 0.55,
      lineBreak: false,
    })
    .text(`Date de création : ${issuedAt.toISOString().slice(0, 10)}`, left + 8, y + 34, {
      width: width * 0.55,
      lineBreak: false,
    })
    .text(`Version : ${CAUTION_FICHE_ENREG_VERSION}`, left + width * 0.55, y + 20, {
      width: width * 0.42,
      align: "right",
      lineBreak: false,
    })
    .text("Page : 1/1", left + width * 0.55, y + 34, {
      width: width * 0.42,
      align: "right",
      lineBreak: false,
    });
  doc.restore();
  doc.x = left;
  doc.y = y + 64;
}

function drawFormField(
  doc: ReturnType<typeof createPremiumPdfDocument>,
  label: string,
  value: string,
): void {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const display = value.trim() || "—";
  ensureSpace(doc, 26);
  doc.x = left;
  doc
    .fillColor(PDF_COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(PDF_TYPOGRAPHY.body)
    .text(`${label} : `, left, doc.y, { continued: true, width });
  doc.font("Helvetica").text(display, { width });
  doc.moveDown(0.35);
}

/**
 * Fiche caution alignée sur le formulaire officiel LONACI_DVGR_PR02_ENREG
 * (« FICHE CAUTION AGREMENT … »).
 */
export async function renderPremiumCautionFicheProvisoirePdf(
  view: CautionFicheProvisoireView,
): Promise<Buffer> {
  const issuedAt = new Date(view.generatedAt);
  const titre = view.titreDocument?.trim() || CAUTION_FICHE_PROVISOIRE_TITLE;
  const doc = createPremiumPdfDocument({
    metadata: {
      title: titre,
      subject: CAUTION_FICHE_EN_ATTENTE_MENTION,
      author: view.agentNom,
      keywords: ["LONACI", "caution", "agrément", CAUTION_FICHE_ENREG_REFERENCE],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    const left = doc.page.margins.left;
    drawEnregHeader(doc, view);

    doc.x = left;
    doc
      .fillColor(PDF_COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(PDF_TYPOGRAPHY.title)
      .text(titre, { align: "center", width: contentWidth(doc) });
    doc
      .moveDown(0.25)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.small)
      .fillColor(PDF_COLORS.muted)
      .text(`Réf. dossier ${view.numeroDossier} · Générée par ${view.agentNom}`, {
        align: "center",
        width: contentWidth(doc),
      });
    doc.moveDown(0.9);

    drawFormField(doc, "NOM", view.nom);
    drawFormField(doc, "PRENOMS", view.prenoms);
    drawFormField(
      doc,
      "N° DISTRIBUTEUR",
      view.codeConcessionnaire?.trim() || "—",
    );
    drawFormField(doc, "N° TERMINAL", view.numeroTerminal?.trim() || "—");
    drawFormField(
      doc,
      CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL.toUpperCase(),
      view.agenceLabel,
    );
    drawFormField(
      doc,
      "SITUATION GEOGRAPHIQUE",
      view.situationGeographique?.trim() || "—",
    );
    drawFormField(doc, "N° TELEPHONE", view.telephone?.trim() || "—");
    drawFormField(doc, "CAUTION A PAYER", formatAmount(view.montantTotalFCFA));
    drawFormField(doc, "CAUTION VERSEE", formatAmount(view.cautionVerseeFCFA));
    drawFormField(doc, "(En lettre)", montantFcfaEnLettres(view.montantTotalFCFA));

    doc.moveDown(PDF_SPACING.sm / 10);
    doc.x = left;
    doc
      .fillColor(PDF_COLORS.ink)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.body)
      .text(
        `Abidjan le ${issuedAt.toLocaleDateString("fr-FR", { dateStyle: "long" })}`,
        { width: contentWidth(doc) },
      );

    doc.moveDown(1.1);
    drawSignatureBlock(doc, [
      {
        label: "Visa agent émetteur",
        name: view.agentNom,
        role: "Agent LONACI",
        dateLabel: issuedAt.toLocaleDateString("fr-FR"),
        footerLabel: "Signature et cachet",
      },
      {
        label: CAUTION_FICHE_SIGNATURE_ROLE,
        footerLabel: "Signature et cachet",
      },
    ]);

    doc.moveDown(0.5);
    doc.x = left;
    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(
        "Document provisoire tant que la caution n’est pas entièrement versée. Conservez la référence dossier pour tout rapprochement.",
        { align: "justify", width: contentWidth(doc) },
      );

    if (view.cautionVerseeFCFA <= 0) {
      drawWatermarks(doc);
    }
    finalizePremiumPages(doc, {
      reference: view.numeroDossier,
      issuedAt,
      documentLabel: "CAUTION · AGREMENT",
      generatedBy: view.agentNom,
    });
  });
}
