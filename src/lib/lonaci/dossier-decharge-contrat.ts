import "server-only";

import PDFDocument from "pdfkit";

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

function drawPdfHeader(doc: InstanceType<typeof PDFDocument>) {
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const topY = doc.page.margins.top;
  const bandH = 52;
  doc.save();
  doc.rect(x, topY, w, bandH).fill("#1e3a5f");
  doc.fillColor("#ffffff").fontSize(11).text("LONACI", x + 14, topY + 10);
  doc.fontSize(8).text("Loterie Nationale de Côte d’Ivoire", x + 14, topY + 26);
  doc.fontSize(7).text("Document officiel — remise contrat client", x + 14, topY + 38);
  doc.restore();
  doc.y = topY + bandH + 14;
  doc.fillColor("#111827").fontSize(13).text(DECHARGE_CONTRAT_TITLE, { align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(11).fillColor("#1d4ed8").text(DECHARGE_CONTRAT_MENTION, { align: "center", underline: true });
  doc.moveDown(0.8);
}

function drawFieldRow(doc: InstanceType<typeof PDFDocument>, label: string, value: string) {
  const y = doc.y;
  doc.fontSize(9).fillColor("#6b7280").text(label, doc.page.margins.left, y, { width: 170 });
  doc.fontSize(10).fillColor("#111827").text(value, doc.page.margins.left + 175, y, {
    width: doc.page.width - doc.page.margins.right - doc.page.margins.left - 180,
    align: "right",
  });
  doc.moveDown(0.55);
}

export async function renderDossierDechargeContratPdf(view: DossierDechargeContratView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawPdfHeader(doc);

    doc.fontSize(9).fillColor("#374151").text(`Réf. dossier : ${view.dossierReference}`, { align: "center" });
    doc.text(
      `Date : ${view.dateRemise.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`,
      { align: "center" },
    );
    doc.moveDown(0.8);

    drawFieldRow(doc, "Nom", view.nomComplet);
    if (view.raisonSociale && view.raisonSociale !== view.nomComplet) {
      drawFieldRow(doc, "Raison sociale", view.raisonSociale);
    }
    drawFieldRow(doc, "Point de vente (PDV)", view.codePdv || "—");
    drawFieldRow(doc, "Agence", view.agenceLabel);
    drawFieldRow(
      doc,
      "Produit",
      view.produits.length === 1
        ? `${view.produits[0]!.produitCode} — ${view.produits[0]!.produitLibelle}`
        : view.produits.map((p) => `${p.produitCode} — ${p.produitLibelle}`).join(" | "),
    );
    drawFieldRow(doc, "Établi par", view.etabliPar);

    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#111827").text("Contrat(s) remis au client", { underline: true });
    doc.moveDown(0.35);
    for (const p of view.produits) {
      doc.fontSize(9).fillColor("#374151").text(`• ${p.produitCode} — ${p.produitLibelle}`);
      doc.fontSize(8).fillColor("#6b7280").text(`   Contrat : ${p.referenceContrat}  |  Annexe : ${p.referenceAnnexe}`);
      doc.moveDown(0.25);
    }

    doc.moveDown(0.8);
    doc
      .fontSize(9)
      .fillColor("#111827")
      .text("Attestation de remise", { underline: true });
    doc.moveDown(0.35);
    doc
      .fontSize(9)
      .fillColor("#374151")
      .text(
        `Je soussigné(e) reconnais avoir reçu le(s) contrat(s) et annexe(s) mentionné(s) ci-dessus, relatifs au point de vente ${view.codePdv || "—"} (${view.agenceLabel}), en date du ${view.dateRemise.toLocaleDateString("fr-FR", { dateStyle: "long" })}.`,
        { align: "justify" },
      );

    doc.moveDown(2);
    const sigY = doc.y;
    const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right - 24) / 2;
    doc.fontSize(8).fillColor("#6b7280").text("Signature du client", doc.page.margins.left, sigY);
    doc.text("Cachet et signature LONACI", doc.page.margins.left + colW + 24, sigY);
    doc
      .moveTo(doc.page.margins.left, sigY + 36)
      .lineTo(doc.page.margins.left + colW, sigY + 36)
      .strokeColor("#cbd5e1")
      .stroke();
    doc
      .moveTo(doc.page.margins.left + colW + 24, sigY + 36)
      .lineTo(doc.page.width - doc.page.margins.right, sigY + 36)
      .stroke();

    doc.moveDown(3);
    doc
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        "Document établi après finalisation du contrat. À conserver par le client et par l’agence.",
        { align: "justify" },
      );

    doc.end();
  });
}
