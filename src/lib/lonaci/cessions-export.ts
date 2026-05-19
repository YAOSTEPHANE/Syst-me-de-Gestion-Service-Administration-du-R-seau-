import "server-only";

import PDFDocument from "pdfkit";

import { cessionOperationDisplayStatutFields } from "@/lib/lonaci/cession-operation-statut-metier";
import { parseDocumentChecklistForKind } from "@/lib/lonaci/cession-dossier-checklist";
import { formatAgenceLibelle, loadAgenceLibelleMap, type AgenceLibelleDoc } from "@/lib/lonaci/zones-abidjan";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";

export type CessionKind = "CESSION" | "DELOCALISATION" | "CESSION_DELOCALISATION";

export type CessionStatus =
  | "SAISIE_AGENT"
  | "CONTROLE_CHEF_SECTION"
  | "VALIDATION_N2"
  | "VALIDEE_CHEF_SERVICE"
  | "REJETEE";

export const CESSION_STATUT_LABELS: Record<CessionStatus, string> = {
  SAISIE_AGENT: "Saisie agent",
  CONTROLE_CHEF_SECTION: "Contrôle chef de section",
  VALIDATION_N2: "Validation N2",
  VALIDEE_CHEF_SERVICE: "Validée chef de service",
  REJETEE: "Rejetée",
};

export type CessionsListFilters = {
  kind?: CessionKind;
  statut?: CessionStatus;
  produitCode?: string;
  agenceId?: string;
  scopeAgenceId?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export type CessionExportRow = {
  reference: string;
  cedantLabel: string;
  cessionnaireLabel: string;
  dateDemande: string;
  statutLabel: string;
  agenceLabel: string;
  produitCode: string;
};

export type CessionExportMeta = {
  generatedAt: string;
  filtersSummary: string;
  total: number;
  kind: CessionKind;
};

async function concessionnaireIdsForAgence(agenceId: string): Promise<string[]> {
  const rows = await prisma.concessionnaire.findMany({
    where: { deletedAt: null, agenceId: agenceId.trim() },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function buildCessionsMongoFilter(
  input: CessionsListFilters,
): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (input.kind) filter.kind = input.kind;
  if (input.statut) filter.statut = input.statut;
  if (input.produitCode) filter.produitCode = input.produitCode.trim().toUpperCase();
  if (input.dateFrom || input.dateTo) {
    const range: Record<string, Date> = {};
    if (input.dateFrom) range.$gte = input.dateFrom;
    if (input.dateTo) range.$lte = input.dateTo;
    filter.dateDemande = range;
  }

  const agenceId = (input.scopeAgenceId ?? input.agenceId)?.trim();
  if (agenceId) {
    const pdvIds = await concessionnaireIdsForAgence(agenceId);
    const inList = pdvIds.length ? pdvIds : ["__none__"];
    filter.$or = [{ cedantId: { $in: inList } }, { concessionnaireId: { $in: inList } }];
  }

  return filter;
}

function formatConcessionnaireLabel(row: {
  id: string;
  nomComplet: string | null;
  codePdv: string | null;
}): string {
  const name = row.nomComplet?.trim() || row.codePdv?.trim() || row.id;
  return row.codePdv?.trim() ? `${name} (${row.codePdv})` : name;
}

export async function buildCessionExportRows(
  rows: Array<{
    reference: string;
    kind: CessionKind;
    cedantId: string | null;
    beneficiaireId: string | null;
    concessionnaireId: string | null;
    produitCode: string | null;
    dateDemande: Date;
    statut: CessionStatus;
    oldAgenceId: string | null;
    acteGenereAt: Date | null;
    documentChecklist: unknown;
  }>,
): Promise<CessionExportRow[]> {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.cedantId) ids.add(r.cedantId);
    if (r.beneficiaireId) ids.add(r.beneficiaireId);
    if (r.concessionnaireId) ids.add(r.concessionnaireId);
  }

  const concRows = ids.size
    ? await prisma.concessionnaire.findMany({
        where: { id: { in: [...ids] }, deletedAt: null },
        select: { id: true, nomComplet: true, codePdv: true, agenceId: true },
      })
    : [];

  const agenceIds = new Set<string>();
  for (const c of concRows) {
    if (c.agenceId) agenceIds.add(c.agenceId);
  }
  for (const r of rows) {
    if (r.oldAgenceId) agenceIds.add(r.oldAgenceId);
  }
  const db = await getDatabase();
  const agenceMap: Map<string, AgenceLibelleDoc> = await loadAgenceLibelleMap(db, [...agenceIds]);

  const concById = new Map(concRows.map((c) => [c.id, c]));

  return rows.map((r) => {
    const cedant = r.cedantId ? concById.get(r.cedantId) : null;
    const benef = r.beneficiaireId ? concById.get(r.beneficiaireId) : null;
    const conc = r.concessionnaireId ? concById.get(r.concessionnaireId) : null;
    const agenceSource = cedant ?? conc;
    const agenceId =
      r.kind === "CESSION"
        ? cedant?.agenceId ?? null
        : r.oldAgenceId ?? conc?.agenceId ?? null;
    const checklist = parseDocumentChecklistForKind(r.kind, r.documentChecklist);
    const display = cessionOperationDisplayStatutFields({
      kind: r.kind,
      statut: r.statut,
      checklistComplet: checklist?.complet ?? null,
      acteGenereAt: r.acteGenereAt,
    });

    return {
      reference: r.reference,
      cedantLabel: cedant ? formatConcessionnaireLabel(cedant) : "—",
      cessionnaireLabel: benef ? formatConcessionnaireLabel(benef) : "—",
      dateDemande: r.dateDemande.toLocaleDateString("fr-FR"),
      statutLabel: display.statutMetierLabel,
      agenceLabel: agenceId
        ? formatAgenceLibelle(agenceMap.get(agenceId), agenceId)
        : agenceSource?.agenceId
          ? formatAgenceLibelle(agenceMap.get(agenceSource.agenceId), agenceSource.agenceId)
          : "—",
      produitCode: r.produitCode ?? "—",
    };
  });
}

export function buildCessionsExportFiltersSummary(input: {
  kind: CessionKind;
  statut?: CessionStatus;
  produitCode?: string;
  agenceLabel?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): string {
  const parts: string[] = [
    `Type : ${
      input.kind === "CESSION"
        ? "Demandes de cession"
        : input.kind === "CESSION_DELOCALISATION"
          ? "Cession-délocalisation"
          : "Délocalisations"
    }`,
  ];
  if (input.dateFrom || input.dateTo) {
    const from = input.dateFrom ? input.dateFrom.toLocaleDateString("fr-FR") : "…";
    const to = input.dateTo ? input.dateTo.toLocaleDateString("fr-FR") : "…";
    parts.push(`Période : ${from} → ${to}`);
  }
  if (input.agenceLabel) parts.push(`Agence : ${input.agenceLabel}`);
  if (input.produitCode) parts.push(`Produit : ${input.produitCode}`);
  if (input.statut) parts.push(`Statut : ${CESSION_STATUT_LABELS[input.statut]}`);
  return parts.join(" · ");
}

const PDF_COLUMNS: { key: keyof CessionExportRow; label: string; width: number }[] = [
  { key: "reference", label: "Référence", width: 72 },
  { key: "cedantLabel", label: "Cédant", width: 118 },
  { key: "cessionnaireLabel", label: "Cessionnaire", width: 118 },
  { key: "dateDemande", label: "Date", width: 58 },
  { key: "statutLabel", label: "Statut", width: 88 },
  { key: "agenceLabel", label: "Agence", width: 72 },
];

export async function renderCessionsListPdf(
  meta: CessionExportMeta,
  rows: CessionExportRow[],
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.save();
    doc.rect(doc.page.margins.left, doc.y, pageW, 44).fill("#312e81");
    doc.fillColor("#ffffff").fontSize(12).text("LONACI — Liste des cessions", doc.page.margins.left + 12, doc.y - 36);
    doc.fontSize(8).text("Spec 5.3 — Export pour rapports mensuels et contrôles terrain", doc.page.margins.left + 12, doc.y - 18);
    doc.restore();
    doc.moveDown(3.2);
    doc.fillColor("#111827");

    doc.fontSize(8).fillColor("#4b5563").text(meta.filtersSummary, { width: pageW });
    doc.text(`Généré le ${new Date(meta.generatedAt).toLocaleString("fr-FR")} · ${meta.total} ligne(s)`, {
      width: pageW,
    });
    doc.moveDown(0.8);

    const colX: number[] = [];
    let x = doc.page.margins.left;
    for (const col of PDF_COLUMNS) {
      colX.push(x);
      x += col.width;
    }

    const drawHeader = () => {
      const y = doc.y;
      doc.save();
      doc.rect(doc.page.margins.left, y, pageW, 16).fill("#e0e7ff");
      doc.fillColor("#312e81").fontSize(7);
      PDF_COLUMNS.forEach((col, i) => {
        doc.text(col.label, colX[i] + 2, y + 4, { width: col.width - 4, lineBreak: false });
      });
      doc.restore();
      doc.y = y + 18;
      doc.fillColor("#111827").fontSize(7);
    };

    drawHeader();

    for (let i = 0; i < rows.length; i++) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage({ layout: "landscape", margin: 36 });
        doc.fontSize(7).fillColor("#111827");
        drawHeader();
      }
      const row = rows[i];
      const y = doc.y;
      if (i % 2 === 1) {
        doc.save();
        doc.rect(doc.page.margins.left, y - 1, pageW, 14).fill("#f8fafc");
        doc.restore();
      }
      PDF_COLUMNS.forEach((col, ci) => {
        const val = String(row[col.key] ?? "—");
        doc.fillColor("#111827").text(val, colX[ci] + 2, y, {
          width: col.width - 4,
          height: 12,
          ellipsis: true,
        });
      });
      doc.y = y + 14;
    }

    if (!rows.length) {
      doc.moveDown(1);
      doc.fontSize(9).fillColor("#6b7280").text("Aucune demande ne correspond aux filtres sélectionnés.");
    }

    doc.end();
  });
}
