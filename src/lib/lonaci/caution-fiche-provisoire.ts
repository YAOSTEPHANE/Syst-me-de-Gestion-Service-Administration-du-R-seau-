import "server-only";

import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

import {
  CAUTION_FICHE_EN_ATTENTE_MENTION,
  CAUTION_FICHE_PROVISOIRE_TITLE,
  getLonaciCautionBankReferences,
} from "@/lib/lonaci/caution-fiche-provisoire-constants";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { listProduits } from "@/lib/lonaci/referentials";
import { formatAgenceLibelle, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";
import type { CautionDocument, ConcessionnaireDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";

export {
  CAUTION_FICHE_EN_ATTENTE_MENTION,
  CAUTION_FICHE_PROVISOIRE_TITLE,
} from "@/lib/lonaci/caution-fiche-provisoire-constants";

const CAUTIONS_COLLECTION = "cautions";
const COUNTERS_COLLECTION = "counters";
const CAUTION_CAU_COUNTER_PREFIX = "caution_cau_";

type StoredCaution = Omit<CautionDocument, "_id"> & { _id: ObjectId };

export interface CautionProduitLigne {
  code: string;
  libelle: string;
  montantFCFA: number;
}

export interface CautionFicheProvisoireView {
  cautionId: string;
  numeroDossier: string;
  generatedAt: string;
  identiteLabel: string;
  identiteDetail: string;
  cniNumero: string | null;
  codePdv: string | null;
  agenceLabel: string;
  produitLignes: CautionProduitLigne[];
  montantTotalFCFA: number;
  dueDate: string;
  bank: ReturnType<typeof getLonaciCautionBankReferences>;
}

function sanitizeAgenceCodeForRef(code: string): string {
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c || "LONACI";
}

/** Référence dossier unique : CAU-2026-EDITEC-0001 */
export async function nextNumeroCautionDossier(agenceCode: string): Promise<string> {
  const db = await getDatabase();
  const year = new Date().getFullYear();
  const code = sanitizeAgenceCodeForRef(agenceCode);
  const counterId = `${CAUTION_CAU_COUNTER_PREFIX}${year}_${code}`;
  await db
    .collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION)
    .updateOne({ _id: counterId }, { $inc: { seq: 1 } }, { upsert: true });
  const c = await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).findOne({ _id: counterId });
  const seq = c?.seq ?? 1;
  return `CAU-${year}-${code}-${String(seq).padStart(4, "0")}`;
}

export function buildCautionProduitLignes(
  produitCodes: string[],
  produits: Awaited<ReturnType<typeof listProduits>>,
): CautionProduitLigne[] {
  const lignes: CautionProduitLigne[] = [];
  for (const raw of produitCodes) {
    const code = raw.trim().toUpperCase();
    if (!code || code === "AUTRES") continue;
    const p = produits.find((x) => x.code.trim().toUpperCase() === code);
    const montant = Math.round(Number(p?.prix ?? 0));
    if (!Number.isFinite(montant) || montant <= 0) continue;
    lignes.push({
      code,
      libelle: p?.libelle?.trim() || code,
      montantFCFA: montant,
    });
  }
  return lignes;
}

export function sumCautionProduitLignes(lignes: CautionProduitLigne[]): number {
  return lignes.reduce((acc, l) => acc + l.montantFCFA, 0);
}

export async function findInscriptionCautionForConcessionnaire(
  concessionnaireId: string,
): Promise<{ caution: StoredCaution; cautionId: string } | null> {
  if (!ObjectId.isValid(concessionnaireId)) return null;
  const db = await getDatabase();
  const row = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne(
    { concessionnaireId, deletedAt: null },
    { sort: { createdAt: -1 } },
  );
  if (!row) return null;
  return { caution: row, cautionId: row._id.toHexString() };
}

export async function buildCautionFicheProvisoireView(
  cautionId: string,
): Promise<CautionFicheProvisoireView | null> {
  if (!ObjectId.isValid(cautionId)) return null;
  const db = await getDatabase();
  const caution = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne({
    _id: new ObjectId(cautionId),
    deletedAt: null,
  });
  if (!caution) return null;

  const pdvId = caution.concessionnaireId?.trim();
  if (!pdvId) return null;

  const conc = await findConcessionnaireById(pdvId);
  if (!conc) return null;

  const produits = await listProduits();
  const codes = conc.produitsAutorises ?? [];
  let lignes = buildCautionProduitLignes(codes, produits);
  if (!lignes.length && caution.produitCode) {
    const code = caution.produitCode.trim().toUpperCase();
    const p = produits.find((x) => x.code.toUpperCase() === code);
    const m = Math.round(caution.montant);
    if (m > 0) {
      lignes = [{ code, libelle: p?.libelle ?? code, montantFCFA: m }];
    }
  }

  const agenceMap = await loadAgenceLibelleMap(db, conc.agenceId ? [conc.agenceId] : []);
  const agenceLabel = conc.agenceId
    ? formatAgenceLibelle(agenceMap.get(conc.agenceId), conc.agenceId)
    : "Sans agence";

  const numeroDossier =
    caution.numeroFicheProvisoire?.trim() ||
    (caution.paymentReference?.startsWith("PROVISOIRE:")
      ? caution.paymentReference.replace(/^PROVISOIRE:/, "")
      : caution.paymentReference) ||
    "—";

  return {
    cautionId,
    numeroDossier,
    generatedAt: caution.createdAt.toISOString(),
    identiteLabel: "Concessionnaire",
    identiteDetail: conc.raisonSociale?.trim() || conc.nomComplet || "—",
    cniNumero: conc.cniNumero,
    codePdv: conc.codePdv,
    agenceLabel,
    produitLignes: lignes,
    montantTotalFCFA: caution.montant,
    dueDate: caution.dueDate.toISOString(),
    bank: getLonaciCautionBankReferences(),
  };
}

function drawWatermark(doc: InstanceType<typeof PDFDocument>) {
  const { width, height } = doc.page;
  doc.save();
  doc.opacity(0.12);
  doc.fillColor("#b45309");
  doc.fontSize(42);
  const text = CAUTION_FICHE_EN_ATTENTE_MENTION;
  doc.rotate(-35, { origin: [width / 2, height / 2] });
  doc.text(text, width * 0.08, height * 0.38, { width: width * 0.85, align: "center" });
  doc.restore();
  doc.opacity(1);
}

function drawLonaciPdfHeader(doc: InstanceType<typeof PDFDocument>) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  doc.save();
  doc.rect(x, doc.y, w, 52).fill("#0f3d2e");
  doc.fillColor("#ffffff").fontSize(11).text("LONACI", x + 14, doc.y - 44);
  doc.fontSize(8).text("Loterie Nationale de Côte d’Ivoire", x + 14, doc.y + 2);
  doc.fontSize(7).text("Document officiel — module Cautions", x + 14, doc.y + 2);
  doc.restore();
  doc.moveDown(3.2);
  doc.fillColor("#111827").fontSize(13).text(CAUTION_FICHE_PROVISOIRE_TITLE, { align: "center" });
  doc.moveDown(0.4);
  doc
    .fontSize(11)
    .fillColor("#b45309")
    .text(CAUTION_FICHE_EN_ATTENTE_MENTION, { align: "center", underline: true });
  doc.moveDown(0.8);
}

function drawFieldRow(doc: InstanceType<typeof PDFDocument>, label: string, value: string) {
  const y = doc.y;
  doc.fontSize(9).fillColor("#6b7280").text(label, doc.page.margins.left, y, { width: 160 });
  doc.fontSize(10).fillColor("#111827").text(value, doc.page.margins.left + 165, y, {
    width: doc.page.width - doc.page.margins.right - doc.page.margins.left - 170,
    align: "right",
  });
  doc.moveDown(0.55);
}

export async function renderCautionFicheProvisoirePdf(view: CautionFicheProvisoireView): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawWatermark(doc);
    drawLonaciPdfHeader(doc);

    doc
      .fontSize(9)
      .fillColor("#374151")
      .text(`Référence dossier : ${view.numeroDossier}`, { align: "center" });
    doc
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        `Émis le ${new Date(view.generatedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`,
        { align: "center" },
      );
    doc.moveDown(0.8);

    drawFieldRow(doc, "Identité", view.identiteDetail);
    if (view.cniNumero) drawFieldRow(doc, "N° CNI", view.cniNumero);
    if (view.codePdv) drawFieldRow(doc, "Code PDV", view.codePdv);
    drawFieldRow(doc, "Agence", view.agenceLabel);

    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#111827").text("Produit(s) et montant(s) de caution due", { underline: true });
    doc.moveDown(0.35);
    for (const l of view.produitLignes) {
      drawFieldRow(doc, l.libelle, `${l.montantFCFA.toLocaleString("fr-FR")} FCFA (${l.code})`);
    }
    if (!view.produitLignes.length) {
      drawFieldRow(doc, "Montant caution due", `${view.montantTotalFCFA.toLocaleString("fr-FR")} FCFA`);
    } else {
      drawFieldRow(doc, "Total caution due", `${view.montantTotalFCFA.toLocaleString("fr-FR")} FCFA`);
    }
    drawFieldRow(
      doc,
      "Échéance indicative",
      new Date(view.dueDate).toLocaleDateString("fr-FR", { dateStyle: "long" }),
    );

    doc.moveDown(0.6);
    doc.fontSize(10).fillColor("#111827").text("Coordonnées bancaires LONACI", { underline: true });
    doc.moveDown(0.35);
    drawFieldRow(doc, "Banque", view.bank.banque);
    drawFieldRow(doc, "Compte / RIB", view.bank.compte);
    if (view.bank.iban) drawFieldRow(doc, "IBAN", view.bank.iban);
    drawFieldRow(doc, "Libellé virement", `${view.bank.libelleVirement} — ${view.numeroDossier}`);

    doc.moveDown(1.2);
    doc.fontSize(8).fillColor("#6b7280").text(
      "Ce document est une fiche provisoire : il ne vaut pas quittance de paiement. Conservez la référence dossier pour tout versement ou rapprochement.",
      { align: "justify" },
    );

    doc.end();
  });
}

export async function buildCautionFicheProvisoireViewForConcessionnaire(
  concessionnaireId: string,
): Promise<CautionFicheProvisoireView | null> {
  const found = await findInscriptionCautionForConcessionnaire(concessionnaireId);
  if (!found) return null;
  return buildCautionFicheProvisoireView(found.cautionId);
}
