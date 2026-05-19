import "server-only";

import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

import { findActiveContratIdForProduct } from "@/lib/lonaci/contracts";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { formatAgenceLibelle, loadAgenceLibelleMap, type AgenceLibelleDoc } from "@/lib/lonaci/zones-abidjan";
import { listProduits } from "@/lib/lonaci/referentials";
import { getDatabase } from "@/lib/mongodb";

export const ACTE_CESSION_TITLE = "ACTE DE CESSION";

const COLLECTION = "cessions";

interface CessionRow {
  _id: ObjectId;
  reference: string;
  kind: string;
  cedantId: string | null;
  beneficiaireId: string | null;
  produitCode: string | null;
  dateDemande: Date;
  motif: string;
  statut: string;
}

export interface ActeCessionPartyView {
  nomComplet: string;
  codePdv: string | null;
  cniNumero: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  agenceLabel: string;
}

export interface ActeCessionView {
  cessionId: string;
  reference: string;
  dateDemande: string;
  motif: string;
  statut: string;
  produitCode: string;
  produitLibelle: string | null;
  contratCedantId: string | null;
  cedant: ActeCessionPartyView;
  beneficiaire: ActeCessionPartyView;
  emisLe: string;
}

function partyFromConcessionnaire(
  doc: Awaited<ReturnType<typeof findConcessionnaireById>>,
  agenceMap: Map<string, AgenceLibelleDoc>,
): ActeCessionPartyView {
  const agenceLabel = doc?.agenceId
    ? formatAgenceLibelle(agenceMap.get(doc.agenceId), doc.agenceId)
    : "—";
  return {
    nomComplet: doc?.nomComplet?.trim() || doc?.raisonSociale?.trim() || "—",
    codePdv: doc?.codePdv?.trim() || null,
    cniNumero: doc?.cniNumero?.trim() || null,
    telephone: doc?.telephonePrincipal?.trim() || doc?.telephone?.trim() || null,
    email: doc?.email?.trim() || null,
    adresse: doc?.adresse?.trim() || null,
    agenceLabel,
  };
}

export async function buildActeCessionView(cessionId: string): Promise<ActeCessionView | null> {
  if (!ObjectId.isValid(cessionId)) return null;
  const db = await getDatabase();
  const row = await db.collection<CessionRow>(COLLECTION).findOne({
    _id: new ObjectId(cessionId),
    deletedAt: null,
    kind: { $in: ["CESSION", "CESSION_DELOCALISATION"] },
  });
  if (!row?.cedantId || !row.beneficiaireId || !row.produitCode) return null;

  const [cedant, beneficiaire, produits] = await Promise.all([
    findConcessionnaireById(row.cedantId),
    findConcessionnaireById(row.beneficiaireId),
    listProduits(),
  ]);
  if (!cedant || cedant.deletedAt || !beneficiaire || beneficiaire.deletedAt) return null;

  const agenceMap = await loadAgenceLibelleMap(db, [cedant.agenceId, beneficiaire.agenceId]);

  const pcode = row.produitCode.trim().toUpperCase();
  const produit = produits.find((p) => p.code.trim().toUpperCase() === pcode);
  const contratCedantId = await findActiveContratIdForProduct({
    concessionnaireId: row.cedantId,
    produitCode: pcode,
  });

  return {
    cessionId: row._id.toHexString(),
    reference: row.reference,
    dateDemande: row.dateDemande.toISOString(),
    motif: row.motif,
    statut: row.statut,
    produitCode: pcode,
    produitLibelle: produit?.libelle ?? null,
    contratCedantId,
    cedant: partyFromConcessionnaire(cedant, agenceMap),
    beneficiaire: partyFromConcessionnaire(beneficiaire, agenceMap),
    emisLe: new Date().toISOString(),
  };
}

function drawActeHeader(doc: InstanceType<typeof PDFDocument>) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  doc.save();
  doc.rect(x, doc.y, w, 52).fill("#312e81");
  doc.fillColor("#ffffff").fontSize(11).text("LONACI", x + 14, doc.y - 44);
  doc.fontSize(8).text("Loterie Nationale de Côte d'Ivoire", x + 14, doc.y + 2);
  doc.fontSize(7).text("Module Demandes de cession — document officiel", x + 14, doc.y + 2);
  doc.restore();
  doc.moveDown(3.2);
  doc.fillColor("#111827").fontSize(14).text(ACTE_CESSION_TITLE, { align: "center", underline: true });
  doc.moveDown(0.8);
}

function drawPartyBlock(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  party: ActeCessionPartyView,
) {
  doc.fontSize(10).fillColor("#312e81").text(title, { underline: true });
  doc.moveDown(0.35);
  const lines: [string, string][] = [
    ["Nom / raison sociale", party.nomComplet],
    ["Code PDV", party.codePdv ?? "—"],
    ["N° CNI", party.cniNumero ?? "—"],
    ["Téléphone", party.telephone ?? "—"],
    ["Email", party.email ?? "—"],
    ["Adresse", party.adresse ?? "—"],
    ["Agence", party.agenceLabel],
  ];
  for (const [label, value] of lines) {
    doc.fontSize(8).fillColor("#6b7280").text(`${label} : `, { continued: true });
    doc.fontSize(9).fillColor("#111827").text(value);
  }
  doc.moveDown(0.6);
}

export async function renderActeCessionPdf(view: ActeCessionView): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawActeHeader(doc);

    doc.fontSize(9).fillColor("#374151").text(`Référence dossier : ${view.reference}`, { align: "center" });
    doc.text(
      `Date de demande : ${new Date(view.dateDemande).toLocaleDateString("fr-FR", { dateStyle: "long" })}`,
      { align: "center" },
    );
    doc.text(`Émis le : ${new Date(view.emisLe).toLocaleString("fr-FR")}`, { align: "center" });
    doc.moveDown(1);

    drawPartyBlock(doc, "Concessionnaire cédant", view.cedant);
    drawPartyBlock(doc, "Concessionnaire cessionnaire (acquéreur)", view.beneficiaire);

    doc.fontSize(10).fillColor("#111827").text("Objet de la cession", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).text(
      `Produit : ${view.produitLibelle ? `${view.produitCode} — ${view.produitLibelle}` : view.produitCode}`,
    );
    if (view.contratCedantId) {
      doc.text(`Contrat en cours du cédant (réf. système) : ${view.contratCedantId}`);
    }
    doc.moveDown(0.4);
    doc.fontSize(9).text(`Motif déclaré : ${view.motif}`);

    doc.moveDown(1);
    doc.fontSize(8).fillColor("#374151").text(
      [
        "Le présent acte atteste la demande de cession du point de vente et des droits associés au produit",
        "indiqué ci-dessus, du concessionnaire cédant au concessionnaire cessionnaire, sous réserve de",
        "validation des pièces du dossier et des autorisations internes LONACI.",
        "",
        "Ce document est généré automatiquement à partir des informations enregistrées dans le système.",
        "Il ne vaut exécution définitive qu'après validation finale par le Chef de Service.",
      ].join("\n"),
      { align: "justify" },
    );

    doc.moveDown(2);
    const y = doc.y;
    const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 12;
    doc.fontSize(8).fillColor("#6b7280").text("Le cédant", doc.page.margins.left, y);
    doc.text("Le cessionnaire", doc.page.margins.left + colW + 24, y);
    doc.moveDown(2.5);
    doc.text("Signature et cachet", doc.page.margins.left, doc.y, { width: colW });
    doc.text("Signature et cachet", doc.page.margins.left + colW + 24, doc.y - 14, { width: colW });
    doc.moveDown(1.2);
    doc.text("Le Chef de Service LONACI", doc.page.margins.left, doc.y, { width: colW });
    doc.text("Date :", doc.page.margins.left + colW + 24, doc.y - 14, { width: colW });

    doc.end();
  });
}
