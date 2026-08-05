import {
  CAUTION_FICHE_DEFINITIVE_TITLE,
  CAUTION_FICHE_PAYEE_MENTION,
} from "@/lib/lonaci/caution-fiche-definitive-constants";
import type { CautionFicheDefinitiveView } from "@/lib/lonaci/caution-fiche-definitive";
import {
  CAUTION_FICHE_AGENCE_INSCRIPTION_LABEL,
  CAUTION_FICHE_ENREG_REFERENCE,
  CAUTION_FICHE_ENREG_VERSION,
  CAUTION_FICHE_SIGNATURE_ROLE,
} from "@/lib/lonaci/caution-fiche-provisoire-constants";
import { montantFcfaEnLettres } from "@/lib/lonaci/montant-en-lettres";
import {
  collectPdfBuffer,
  contentWidth,
  createPremiumPdfDocument,
  finalizePremiumPages,
} from "@/lib/pdf/document";
import {
  drawQrBlock,
  drawSignatureBlock,
  drawStatusBadge,
  ensureSpace,
} from "@/lib/pdf/primitives";
import { PDF_COLORS, PDF_SPACING, PDF_TYPOGRAPHY } from "@/lib/pdf/tokens";

function formatAmount(value: number): string {
  if (!value) return "—";
  return `${value.toLocaleString("fr-FR")} FCFA`;
}

function drawEnregHeader(
  doc: ReturnType<typeof createPremiumPdfDocument>,
  issuedAt: Date,
): void {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
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
  doc.moveDown(0.3);
}

/**
 * Fiche définitive (FPD) — même canevas officiel LONACI_DVGR_PR02_ENREG,
 * avec caution versée renseignée.
 */
export async function renderPremiumCautionFicheDefinitivePdf(
  view: CautionFicheDefinitiveView,
  qrPng: Buffer | null,
): Promise<Buffer> {
  const issuedAt = new Date(view.emiseLe);
  const paymentDate = new Date(view.datePaiement);
  const titre = view.titreDocument?.trim() || CAUTION_FICHE_DEFINITIVE_TITLE;
  const doc = createPremiumPdfDocument({
    metadata: {
      title: titre,
      subject: CAUTION_FICHE_PAYEE_MENTION,
      author: view.agentNom,
      keywords: ["LONACI", "caution", "agrément", "FPD", CAUTION_FICHE_ENREG_REFERENCE],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    const left = doc.page.margins.left;
    drawEnregHeader(doc, issuedAt);

    doc.x = left;
    doc
      .fillColor(PDF_COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(PDF_TYPOGRAPHY.title)
      .text(titre, { align: "center", width: contentWidth(doc) });
    doc
      .moveDown(0.2)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.small)
      .fillColor(PDF_COLORS.muted)
      .text(
        `Réf. ${view.numeroFicheDefinitive} · Générée par ${view.agentNom}`,
        { align: "center", width: contentWidth(doc) },
      );
    doc.moveDown(0.45);
    drawStatusBadge(doc, CAUTION_FICHE_PAYEE_MENTION, "success");
    doc.moveDown(0.35);

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
    drawFormField(doc, "CAUTION A PAYER", formatAmount(view.montantFCFA));
    drawFormField(doc, "CAUTION VERSEE", formatAmount(view.montantFCFA));
    drawFormField(doc, "(En lettre)", montantFcfaEnLettres(view.montantFCFA));
    drawFormField(doc, "MODE DE PAIEMENT", view.modeLibelle);
    drawFormField(doc, "REFERENCE DE PAIEMENT", view.paymentReference);
    if (view.numeroFicheProvisoire?.trim()) {
      drawFormField(doc, "FICHE PROVISOIRE (FPC)", view.numeroFicheProvisoire.trim());
    }

    doc.moveDown(PDF_SPACING.sm / 12);
    doc.x = left;
    doc
      .fillColor(PDF_COLORS.ink)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.body)
      .text(
        `Abidjan le ${paymentDate.toLocaleDateString("fr-FR", { dateStyle: "long" })}`,
        { width: contentWidth(doc) },
      );

    if (qrPng) {
      doc.moveDown(0.5);
      drawQrBlock(doc, {
        label: "Vérification QR",
        description:
          "Scannez ce code pour contrôler l’identifiant de caution, la fiche définitive et la référence de paiement.",
        image: qrPng,
        size: 72,
      });
    }

    doc.moveDown(0.8);
    drawSignatureBlock(doc, [
      {
        label: "Visa agent émetteur",
        name: view.agentNom,
        role: "Agent LONACI",
        dateLabel: paymentDate.toLocaleDateString("fr-FR"),
        footerLabel: "Signature et cachet",
      },
      {
        label: CAUTION_FICHE_SIGNATURE_ROLE,
        footerLabel: "Signature et cachet",
      },
    ]);

    doc.moveDown(0.4);
    doc.x = left;
    doc
      .fillColor(PDF_COLORS.muted)
      .font("Helvetica")
      .fontSize(PDF_TYPOGRAPHY.label)
      .text(
        "Ce document atteste le règlement de la caution. La référence de paiement est unique et obligatoire pour tout rapprochement comptable.",
        { align: "justify", width: contentWidth(doc) },
      );

    finalizePremiumPages(doc, {
      reference: view.numeroFicheDefinitive,
      issuedAt,
      documentLabel: "CAUTION · AGREMENT",
      generatedBy: view.agentNom,
    });
  });
}
