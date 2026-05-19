import "server-only";

import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { formatAgenceLibelle, loadAgenceLibelleMap, type AgenceLibelleDoc } from "@/lib/lonaci/zones-abidjan";
import { listProduits } from "@/lib/lonaci/referentials";
import { getDatabase } from "@/lib/mongodb";

export const ACTE_DELOCALISATION_TITLE = "ACTE DE DÉLOCALISATION";

const COLLECTION = "cessions";

interface CessionRow {
  _id: ObjectId;
  reference: string;
  kind: string;
  deletedAt: Date | null;
  linkedOperationId?: string | null;
  concessionnaireId: string | null;
  beneficiaireId: string | null;
  produitCode: string | null;
  oldAdresse: string | null;
  oldAgenceId: string | null;
  newAdresse: string | null;
  newAgenceId: string | null;
  newGps: { lat: number; lng: number } | null;
  dateDemande: Date;
  motif: string;
}

export interface ActeDelocalisationView {
  cessionId: string;
  reference: string;
  dateDemande: string;
  motif: string;
  produitCode: string | null;
  produitLibelle: string | null;
  nomComplet: string;
  codePdv: string | null;
  ancienneAdresse: string;
  ancienneAgenceLabel: string;
  nouvelleAdresse: string;
  nouvelleAgenceLabel: string;
  nouvelleGps: { lat: number; lng: number };
  emisLe: string;
  linkedOperationId: string | null;
}

function resolveConcessionnaireId(row: CessionRow): string | null {
  if (row.kind === "DELOCALISATION") return row.concessionnaireId;
  if (row.kind === "CESSION_DELOCALISATION") return row.beneficiaireId;
  return null;
}

export async function buildActeDelocalisationView(cessionId: string): Promise<ActeDelocalisationView | null> {
  if (!ObjectId.isValid(cessionId)) return null;
  const db = await getDatabase();
  const row = await db.collection<CessionRow>(COLLECTION).findOne({
    _id: new ObjectId(cessionId),
    deletedAt: null,
    kind: { $in: ["DELOCALISATION", "CESSION_DELOCALISATION"] },
  });
  if (!row?.newGps || !row.newAgenceId) return null;

  const pdvId = resolveConcessionnaireId(row);
  if (!pdvId) return null;

  const [pdv, produits] = await Promise.all([findConcessionnaireById(pdvId), listProduits()]);
  if (!pdv || pdv.deletedAt) return null;

  const agenceIds = [row.oldAgenceId, row.newAgenceId, pdv.agenceId].filter(Boolean) as string[];
  const agenceMap: Map<string, AgenceLibelleDoc> = await loadAgenceLibelleMap(db, agenceIds);

  const pcode = row.produitCode?.trim().toUpperCase() ?? null;
  const produit = pcode ? produits.find((p) => p.code.trim().toUpperCase() === pcode) : null;

  return {
    cessionId: row._id.toHexString(),
    reference: row.reference,
    dateDemande: row.dateDemande.toISOString(),
    motif: row.motif,
    produitCode: pcode,
    produitLibelle: produit?.libelle ?? null,
    nomComplet: pdv.nomComplet?.trim() || pdv.raisonSociale?.trim() || "—",
    codePdv: pdv.codePdv?.trim() || null,
    ancienneAdresse: row.oldAdresse?.trim() || pdv.adresse?.trim() || "—",
    ancienneAgenceLabel: formatAgenceLibelle(
      agenceMap.get(row.oldAgenceId ?? ""),
      row.oldAgenceId,
    ),
    nouvelleAdresse: row.newAdresse?.trim() || "—",
    nouvelleAgenceLabel: formatAgenceLibelle(agenceMap.get(row.newAgenceId), row.newAgenceId),
    nouvelleGps: row.newGps,
    emisLe: new Date().toISOString(),
    linkedOperationId: (row as { linkedOperationId?: string | null }).linkedOperationId ?? null,
  };
}

export async function renderActeDelocalisationPdf(view: ActeDelocalisationView): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const x = doc.page.margins.left;
    doc.save();
    doc.rect(x, doc.y, w, 52).fill("#0e7490");
    doc.fillColor("#ffffff").fontSize(11).text("LONACI", x + 14, doc.y - 44);
    doc.fontSize(8).text("Loterie Nationale de Côte d'Ivoire", x + 14, doc.y + 2);
    doc.fontSize(7).text("Module Délocalisation — document officiel (spec 6.1 / 6.2)", x + 14, doc.y + 2);
    doc.restore();
    doc.moveDown(3.2);
    doc.fillColor("#111827").fontSize(14).text(ACTE_DELOCALISATION_TITLE, { align: "center", underline: true });
    doc.moveDown(0.8);

    doc.fontSize(9).fillColor("#374151").text(`Référence dossier : ${view.reference}`, { align: "center" });
    if (view.linkedOperationId) {
      doc.text(`Opération liée (traçabilité 6.2) : ${view.linkedOperationId}`, { align: "center" });
    }
    doc.text(
      `Date de demande : ${new Date(view.dateDemande).toLocaleDateString("fr-FR", { dateStyle: "long" })}`,
      { align: "center" },
    );
    doc.moveDown(1);

    doc.fontSize(10).fillColor("#0e7490").text("Concessionnaire concerné", { underline: true });
    doc.moveDown(0.35);
    doc.fontSize(9).fillColor("#111827").text(`${view.nomComplet}${view.codePdv ? ` (${view.codePdv})` : ""}`);
    if (view.produitCode) {
      doc.text(
        `Produit (contrat conservé) : ${view.produitLibelle ? `${view.produitCode} — ${view.produitLibelle}` : view.produitCode}`,
      );
    }
    doc.moveDown(0.6);

    doc.fontSize(10).fillColor("#0e7490").text("Ancienne implantation", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#111827").text(`Adresse : ${view.ancienneAdresse}`);
    doc.text(`Agence / zone : ${view.ancienneAgenceLabel}`);
    doc.moveDown(0.6);

    doc.fontSize(10).fillColor("#0e7490").text("Nouvelle implantation", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#111827").text(`Adresse : ${view.nouvelleAdresse}`);
    doc.text(`Agence / zone : ${view.nouvelleAgenceLabel}`);
    doc.text(`Coordonnées GPS : ${view.nouvelleGps.lat.toFixed(6)}, ${view.nouvelleGps.lng.toFixed(6)}`);
    doc.moveDown(0.6);

    doc.fontSize(9).text(`Motif : ${view.motif}`);
    doc.moveDown(1);
    doc.fontSize(8).fillColor("#374151").text(
      [
        "Le présent acte atteste la demande de délocalisation du point de vente vers la nouvelle zone",
        "géographique indiquée, en conservation du contrat et des droits associés au produit.",
        "",
        "Ce document est généré automatiquement. Il ne vaut exécution définitive qu'après validation",
        "par le Chef de Section puis le Chef de Service.",
      ].join("\n"),
      { align: "justify" },
    );

    doc.end();
  });
}
