import "server-only";

import { ObjectId } from "mongodb";

import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { formatAgenceLibelle, loadAgenceLibelleMap, type AgenceLibelleDoc } from "@/lib/lonaci/zones-abidjan";
import { listProduits } from "@/lib/lonaci/referentials";
import { getDatabase } from "@/lib/mongodb";
import {
  collectPdfBuffer,
  contentWidth,
  createPremiumPdfDocument,
  drawInformationCard,
  drawSection,
  drawTitle,
  ensureSpace,
  finalizePremiumPages,
  PDF_COLORS,
  PDF_SPACING,
  PDF_TYPOGRAPHY,
  type PdfField,
} from "@/lib/pdf";

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
  const issuedAt = new Date(view.emisLe);
  const doc = createPremiumPdfDocument({
    metadata: {
      title: ACTE_DELOCALISATION_TITLE,
      subject: `Acte de délocalisation ${view.reference}`,
      creationDate: issuedAt,
    },
  });
  return collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      ACTE_DELOCALISATION_TITLE,
      `Référence dossier : ${view.reference} · Date de demande : ${new Date(view.dateDemande).toLocaleDateString("fr-FR", { dateStyle: "long" })}`,
    );

    const partyFields: PdfField[] = [
      { label: "Concessionnaire", value: view.nomComplet },
      { label: "Code PDV", value: view.codePdv ?? "—" },
      ...(view.produitCode
        ? [
            {
              label: "Produit (contrat conservé)",
              value: view.produitLibelle
                ? `${view.produitCode} — ${view.produitLibelle}`
                : view.produitCode,
            },
          ]
        : []),
      ...(view.linkedOperationId
        ? [{ label: "Opération liée", value: view.linkedOperationId }]
        : []),
    ];
    drawSection(doc, "Concessionnaire concerné");
    drawInformationCard(doc, partyFields);

    drawSection(doc, "Ancienne implantation");
    drawInformationCard(doc, [
      { label: "Adresse", value: view.ancienneAdresse },
      { label: "Agence / zone", value: view.ancienneAgenceLabel },
    ]);

    drawSection(doc, "Nouvelle implantation");
    drawInformationCard(doc, [
      { label: "Adresse", value: view.nouvelleAdresse },
      { label: "Agence / zone", value: view.nouvelleAgenceLabel },
      {
        label: "Coordonnées GPS",
        value: `${view.nouvelleGps.lat.toFixed(6)}, ${view.nouvelleGps.lng.toFixed(6)}`,
      },
    ]);

    drawSection(doc, "Motif");
    drawInformationCard(doc, [{ label: "Motif déclaré", value: view.motif }]);

    const legalText = [
      "Le présent acte atteste la demande de délocalisation du point de vente vers la nouvelle zone",
      "géographique indiquée, en conservation du contrat et des droits associés au produit.",
      "",
      "Ce document est généré automatiquement. Il ne vaut exécution définitive qu'après validation",
      "par le Chef de Section puis le Chef de Service.",
    ].join("\n");
    doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.label);
    ensureSpace(
      doc,
      doc.heightOfString(legalText, { width: contentWidth(doc) }) + PDF_SPACING.md,
    );
    doc
      .fillColor(PDF_COLORS.ink)
      .text(legalText, { width: contentWidth(doc), align: "justify" });

    finalizePremiumPages(doc, {
      reference: view.reference,
      issuedAt,
      documentLabel: "ACTE DE DÉLOCALISATION",
    });
  });
}
