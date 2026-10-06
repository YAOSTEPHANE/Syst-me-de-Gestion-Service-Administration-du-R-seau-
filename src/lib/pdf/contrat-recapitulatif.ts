import "server-only";

import type { CautionStatus } from "@/lib/lonaci/constants";
import {
  contratOperationTypeLabel,
  dossierHistoryStepLabel,
  dossierStatusLabel,
  isDossierStatus,
  parseContratOperationType,
} from "@/lib/lonaci/dossier-labels";
import type {
  DossierDocument,
  DossierDocumentChecklistEntry,
  DossierDocumentChecklistPayload,
  DossierDocumentChecklistStatut,
  DossierValidationStep,
} from "@/lib/lonaci/types";

import {
  collectPdfBuffer,
  createPremiumPdfDocument,
  drawInformationCard,
  drawPaginatedTable,
  drawSection,
  drawStatusBadge,
  drawTitle,
  finalizePremiumPages,
  type PdfTableColumn,
  type PdfStatusTone,
} from ".";

export interface ContratRecapitulatifTitulaire {
  kind: "client" | "concessionnaire";
  nom: string;
  code: string;
  cniNumero: string | null;
  telephone: string | null;
  adresse: string | null;
}

export interface ContratRecapitulatifProduit {
  code: string;
  libelle: string;
  caution: { referenceLabel: string; status: string } | null;
}

export interface ContratRecapitulatifContrat {
  reference: string;
  annexeReference: string | null;
  produitCode: string;
  status: string;
  dateEffet: Date;
}

export interface ContratRecapitulatifData {
  dossier: DossierDocument;
  titulaire: ContratRecapitulatifTitulaire | null;
  agenceLabel: string;
  produits: readonly ContratRecapitulatifProduit[];
  checklist: DossierDocumentChecklistPayload | null;
  contrats: readonly ContratRecapitulatifContrat[];
  userNames: ReadonlyMap<string, string>;
}

const TIME_ZONE = "Africa/Abidjan";

const CAUTION_STATUS_LABELS: Record<CautionStatus, string> = {
  EN_ATTENTE: "En attente de paiement",
  VALIDE_N1: "En attente de paiement",
  VALIDE_N2: "En attente de paiement",
  A_CORRIGER: "À corriger",
  PAYEE: "Payée",
  EXONEREE: "Exonérée",
  ANNULEE: "Annulée",
};

const CONTRAT_STATUS_LABELS: Record<string, string> = {
  ACTIF: "Actif",
  RESILIE: "Résilié",
  CEDE: "Cédé",
};

function text(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "—";
  return date.toLocaleDateString("fr-FR", { timeZone: TIME_ZONE });
}

function formatDateTime(value: Date): string {
  return value.toLocaleString("fr-FR", { timeZone: TIME_ZONE, dateStyle: "short", timeStyle: "short" });
}

function dossierStatusTone(status: string): PdfStatusTone {
  if (!isDossierStatus(status)) return "neutral";
  switch (status) {
    case "FINALISE":
      return "success";
    case "REJETE":
      return "danger";
    case "BROUILLON":
      return "neutral";
    case "SOUMIS":
    case "VALIDE_N1":
    case "VALIDE_N2":
      return "warning";
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}

function checklistStatutLabel(statut: DossierDocumentChecklistStatut): string {
  switch (statut) {
    case "FOURNI":
      return "Fourni";
    case "MANQUANT":
      return "Manquant";
    case "EN_ATTENTE":
      return "En attente";
    default: {
      const unhandled: never = statut;
      return unhandled;
    }
  }
}

function cautionStatusLabel(status: string): string {
  return CAUTION_STATUS_LABELS[status as CautionStatus] ?? status;
}

function finalisationDate(history: readonly DossierValidationStep[]): Date | null {
  const step = [...history].reverse().find((h) => h.status === "FINALISE");
  return step?.actedAt ?? null;
}

const CHECKLIST_COLUMNS: readonly PdfTableColumn<DossierDocumentChecklistEntry>[] = [
  { header: "Pièce", width: 299, value: (row) => (row.annexe ? `${row.libelle} (annexe)` : row.libelle) },
  { header: "Obligatoire", width: 90, value: (row) => (row.obligatoire ? "Oui" : "Non") },
  { header: "Statut", width: 110, value: (row) => checklistStatutLabel(row.statut) },
];

const CAUTION_COLUMNS: readonly PdfTableColumn<ContratRecapitulatifProduit>[] = [
  { header: "Produit", width: 189, value: (row) => `${row.code} — ${row.libelle}` },
  { header: "Fiche caution", width: 170, value: (row) => row.caution?.referenceLabel ?? "Aucune caution" },
  { header: "Statut", width: 140, value: (row) => (row.caution ? cautionStatusLabel(row.caution.status) : "—") },
];

const CONTRAT_COLUMNS: readonly PdfTableColumn<ContratRecapitulatifContrat>[] = [
  { header: "Contrat", width: 130, value: (row) => row.reference },
  { header: "Annexe", width: 130, value: (row) => row.annexeReference ?? "—" },
  { header: "Produit", width: 79, value: (row) => row.produitCode },
  { header: "Statut", width: 70, value: (row) => CONTRAT_STATUS_LABELS[row.status] ?? row.status },
  { header: "Date d'effet", width: 90, value: (row) => formatDate(row.dateEffet) },
];

function historyColumns(userNames: ReadonlyMap<string, string>): readonly PdfTableColumn<DossierValidationStep>[] {
  return [
    { header: "Étape", width: 112, value: (row) => dossierHistoryStepLabel(row.status) },
    { header: "Date", width: 105, value: (row) => formatDateTime(row.actedAt) },
    { header: "Intervenant", width: 115, value: (row) => userNames.get(row.actedByUserId) ?? "Utilisateur inconnu" },
    { header: "Commentaire", width: 167, value: (row) => row.comment },
  ];
}

export async function renderContratRecapitulatifPdf(
  data: ContratRecapitulatifData,
  issuedAt = new Date(),
  agentNom = "Agent LONACI",
): Promise<Buffer> {
  const { dossier, titulaire, checklist } = data;
  const doc = createPremiumPdfDocument({
    metadata: {
      title: `Récapitulatif dossier contrat ${dossier.reference}`,
      subject: "Synthèse du dossier contrat : titulaire, pièces, caution, contrats et historique",
      author: agentNom,
      keywords: ["contrat", "dossier", "récapitulatif"],
      creationDate: issuedAt,
    },
  });

  return collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      "Récapitulatif du dossier contrat",
      `Référence ${dossier.reference} · Générée par ${agentNom}`,
    );
    drawStatusBadge(doc, dossierStatusLabel(dossier.status), dossierStatusTone(dossier.status));

    drawSection(doc, "Titulaire");
    drawInformationCard(
      doc,
      titulaire
        ? [
            { label: "Type", value: titulaire.kind === "client" ? "Client" : "Concessionnaire (PDV)" },
            { label: "Nom", value: text(titulaire.nom) },
            { label: titulaire.kind === "client" ? "Code client" : "Code PDV", value: text(titulaire.code) },
            { label: "N° CNI", value: text(titulaire.cniNumero) },
            { label: "Téléphone", value: text(titulaire.telephone) },
            { label: "Adresse", value: text(titulaire.adresse) },
            { label: "Agence", value: text(data.agenceLabel) },
          ]
        : [
            { label: "Titulaire", value: "Fiche client ou PDV introuvable" },
            { label: "Agence", value: text(data.agenceLabel) },
          ],
    );

    drawSection(doc, "Opération contractuelle");
    const observations = typeof dossier.payload.observations === "string" ? dossier.payload.observations : null;
    drawInformationCard(doc, [
      {
        label: "Type d'opération",
        value: text(contratOperationTypeLabel(parseContratOperationType(dossier.payload))),
      },
      {
        label: data.produits.length > 1 ? "Produits" : "Produit",
        value: data.produits.length ? data.produits.map((p) => `${p.code} — ${p.libelle}`).join(", ") : "—",
      },
      {
        label: "Date d'opération",
        value: formatDate(
          (dossier.payload.dateOperation ?? dossier.payload.dateEffet) as string | Date | null | undefined,
        ),
      },
      { label: "Dossier créé le", value: formatDate(dossier.createdAt) },
      { label: "Finalisé le", value: formatDate(finalisationDate(dossier.history)) },
      { label: "Observations", value: text(observations) },
    ]);

    drawSection(doc, "Pièces du dossier");
    if (checklist) {
      const fournies = checklist.entries.filter((e) => e.statut === "FOURNI").length;
      drawInformationCard(doc, [
        { label: "Checklist", value: checklist.complet ? "Complète" : "Incomplète" },
        { label: "Pièces fournies", value: `${fournies} / ${checklist.entries.length}` },
      ]);
      drawPaginatedTable(doc, {
        columns: CHECKLIST_COLUMNS,
        rows: checklist.entries,
        emptyLabel: "Aucune pièce attendue.",
      });
    } else {
      drawInformationCard(doc, [{ label: "Checklist", value: "Non constituée" }]);
    }

    drawSection(doc, "Caution");
    drawPaginatedTable(doc, {
      columns: CAUTION_COLUMNS,
      rows: data.produits,
      emptyLabel: "Aucun produit sur ce dossier.",
    });

    drawSection(doc, "Contrats générés");
    drawPaginatedTable(doc, {
      columns: CONTRAT_COLUMNS,
      rows: data.contrats,
      emptyLabel: "Aucun contrat généré pour l'instant.",
    });

    drawSection(doc, "Historique du dossier");
    drawPaginatedTable(doc, {
      columns: historyColumns(data.userNames),
      rows: dossier.history,
      emptyLabel: "Aucune étape enregistrée.",
      minRowHeight: 30,
    });

    finalizePremiumPages(doc, {
      reference: dossier.reference,
      issuedAt,
      documentLabel: "RÉCAPITULATIF CONTRAT",
      generatedBy: agentNom,
    });
  });
}
