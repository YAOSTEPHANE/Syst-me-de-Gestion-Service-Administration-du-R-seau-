import "server-only";

import { ObjectId } from "mongodb";

import { findActiveContratIdForProduct } from "@/lib/lonaci/contracts";
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
  drawSignatureBlock,
  drawStatusBadge,
  drawTitle,
  ensureSpace,
  finalizePremiumPages,
  PDF_COLORS,
  PDF_SPACING,
  PDF_TYPOGRAPHY,
  type PdfField,
} from "@/lib/pdf";

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

function partyFields(party: ActeCessionPartyView): PdfField[] {
  return [
    { label: "Nom / raison sociale", value: party.nomComplet },
    { label: "Code PDV", value: party.codePdv ?? "—" },
    { label: "N° CNI", value: party.cniNumero ?? "—" },
    { label: "Téléphone", value: party.telephone ?? "—" },
    { label: "Email", value: party.email ?? "—" },
    { label: "Adresse", value: party.adresse ?? "—" },
    { label: "Agence", value: party.agenceLabel },
  ];
}

export async function renderActeCessionPdf(view: ActeCessionView): Promise<Buffer> {
  const issuedAt = new Date(view.emisLe);
  const doc = createPremiumPdfDocument({
    metadata: {
      title: ACTE_CESSION_TITLE,
      subject: `Acte de cession ${view.reference}`,
      creationDate: issuedAt,
    },
  });
  return collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      ACTE_CESSION_TITLE,
      `Référence dossier : ${view.reference} · Date de demande : ${new Date(view.dateDemande).toLocaleDateString("fr-FR", { dateStyle: "long" })} · Émis le : ${issuedAt.toLocaleString("fr-FR")}`,
    );
    drawStatusBadge(doc, view.statut, "info");

    drawSection(doc, "Concessionnaire cédant");
    drawInformationCard(doc, partyFields(view.cedant));
    drawSection(doc, "Concessionnaire cessionnaire (acquéreur)");
    drawInformationCard(doc, partyFields(view.beneficiaire));

    const objectFields: PdfField[] = [
      {
        label: "Produit",
        value: view.produitLibelle
          ? `${view.produitCode} — ${view.produitLibelle}`
          : view.produitCode,
      },
      ...(view.contratCedantId
        ? [
            {
              label: "Référence du contrat en cours du cédant",
              value: view.contratCedantId,
            },
          ]
        : []),
      { label: "Motif déclaré", value: view.motif },
    ];
    drawSection(doc, "Objet de la cession");
    drawInformationCard(doc, objectFields);

    const legalText = [
      "Le présent acte atteste la demande de cession du point de vente et des droits associés au produit",
      "indiqué ci-dessus, du concessionnaire cédant au concessionnaire cessionnaire, sous réserve de",
      "validation des pièces du dossier et des autorisations internes LONACI.",
      "",
      "Ce document est généré automatiquement à partir des informations enregistrées dans le système.",
      "Il ne vaut exécution définitive qu'après validation finale par le Chef de Service.",
    ].join("\n");
    doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.label);
    const legalHeight =
      doc.heightOfString(legalText, { width: contentWidth(doc) }) + PDF_SPACING.lg;
    ensureSpace(doc, legalHeight);
    doc
      .fillColor(PDF_COLORS.ink)
      .text(legalText, { width: contentWidth(doc), align: "justify" });
    doc.y += PDF_SPACING.lg;

    drawSection(doc, "Signatures");
    drawSignatureBlock(doc, [
      { label: "Le cédant", role: "Signature et cachet" },
      { label: "Le cessionnaire", role: "Signature et cachet" },
    ]);
    drawSignatureBlock(doc, [
      { label: "Le Chef de Service LONACI", dateLabel: "Date :" },
    ]);

    finalizePremiumPages(doc, {
      reference: view.reference,
      issuedAt,
      documentLabel: "ACTE DE CESSION",
    });
  });
}
