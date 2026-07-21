import "server-only";

import { ObjectId } from "mongodb";

import {
  DECHARGE_PROVISOIRE_DISCLAIMER,
  DECHARGE_PROVISOIRE_TITLE,
} from "@/lib/lonaci/dossier-decharge-constants";
import { loadDossierContratParty } from "@/lib/lonaci/dossier-contrat-party";
import { findDossierById } from "@/lib/lonaci/dossiers";
import {
  ensureChecklistForDossierProduits,
  getDossierProduitCodes,
} from "@/lib/lonaci/dossier-produits";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";
import { DOSSIER_CHECKLIST_STATUT_LABELS } from "@/lib/lonaci/produit-document-checklist";
import type { CautionDocument, DossierDocument, DossierDocumentChecklistPayload, DossierStatus } from "@/lib/lonaci/types";
import { formatAgenceLibelle, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";
import { getDatabase } from "@/lib/mongodb";
import {
  collectPdfBuffer,
  contentWidth,
  createPremiumPdfDocument,
  drawBulletList,
  drawInformationCard,
  drawSection,
  drawStatusBadge,
  drawTitle,
  ensureSpace,
  finalizePremiumPages,
  PDF_COLORS,
  PDF_SPACING,
  PDF_TYPOGRAPHY,
  type PdfField,
} from "@/lib/pdf";
import { prisma } from "@/lib/prisma";

const CAUTIONS_COLLECTION = "cautions";

export {
  DECHARGE_PROVISOIRE_DISCLAIMER,
  DECHARGE_PROVISOIRE_TITLE,
} from "@/lib/lonaci/dossier-decharge-constants";

type StoredCaution = Omit<CautionDocument, "_id"> & { _id: ObjectId };

export interface DossierDechargeProvisoireCautionInfo {
  cautionId: string;
  referenceLabel: string;
  paymentReference: string | null;
  status: string;
  numeroFicheProvisoire: string | null;
  numeroFicheDefinitive: string | null;
}

export interface DossierDechargeProvisoireView {
  dossierReference: string;
  dossierStatus: DossierStatus;
  generatedAt: Date;
  identiteLabel: string;
  identiteDetail: string;
  codePdv: string;
  cniNumero: string | null;
  agenceLabel: string;
  produitCode: string;
  produitLibelle: string;
  produitCodes: string[];
  produitLibelles: string[];
  documentsFournis: string[];
  documentsManquants: string[];
  caution: DossierDechargeProvisoireCautionInfo | null;
  cautions: DossierDechargeProvisoireCautionInfo[];
}

export function dossierEligibleDechargeProvisoire(
  checklist: DossierDocumentChecklistPayload,
  dossierStatus: DossierStatus,
): boolean {
  if (dossierStatus === "FINALISE") return false;
  if (!checklist.entries.length) return false;
  return !checklist.complet;
}

function mapCautionReference(caution: StoredCaution): DossierDechargeProvisoireCautionInfo {
  const cautionId = caution._id.toHexString();
  const referenceLabel =
    caution.numeroFicheDefinitive?.trim() ||
    caution.numeroFicheProvisoire?.trim() ||
    caution.paymentReference?.trim() ||
    cautionId;
  return {
    cautionId,
    referenceLabel,
    paymentReference:
      caution.status === "PAYEE" && caution.paymentReference?.trim()
        ? caution.paymentReference.trim()
        : null,
    status: caution.status,
    numeroFicheProvisoire: caution.numeroFicheProvisoire ?? null,
    numeroFicheDefinitive: caution.numeroFicheDefinitive ?? null,
  };
}

export async function findAssociatedCautionForDossier(
  input: {
    concessionnaireId?: string | null;
    lonaciClientId?: string | null;
    produitCode: string;
    parentContratId?: string | null;
    explicitCautionId?: string | null;
  },
): Promise<DossierDechargeProvisoireCautionInfo | null> {
  const pcode = input.produitCode.trim().toUpperCase();
  const db = await getDatabase();
  const concessionnaireId = input.concessionnaireId?.trim() || null;
  const lonaciClientId = input.lonaciClientId?.trim() || null;

  if (input.explicitCautionId?.trim() && ObjectId.isValid(input.explicitCautionId.trim())) {
    const direct = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne({
      _id: new ObjectId(input.explicitCautionId.trim()),
      deletedAt: null,
    });
    if (direct) {
      return mapCautionReference(direct);
    }
  }

  const contratIds = new Set<string>();
  if (input.parentContratId?.trim()) {
    contratIds.add(input.parentContratId.trim());
  }

  const contratWhere = lonaciClientId
    ? { lonaciClientId, produitCode: pcode, deletedAt: null }
    : concessionnaireId
      ? { concessionnaireId, produitCode: pcode, deletedAt: null }
      : null;
  if (contratWhere) {
    const contrats = await prisma.contrat.findMany({
      where: contratWhere,
      select: { id: true },
    });
    for (const c of contrats) {
      contratIds.add(c.id);
    }
  }

  if (contratIds.size > 0) {
    const rows = await db
      .collection<StoredCaution>(CAUTIONS_COLLECTION)
      .find({ deletedAt: null, contratId: { $in: [...contratIds] } })
      .sort({ updatedAt: -1 })
      .toArray();
    if (rows.length) {
      const paid = rows.find((r) => r.status === "PAYEE");
      return mapCautionReference(paid ?? rows[0]);
    }
  }

  if (lonaciClientId) {
    const clientRows = await db
      .collection<StoredCaution>(CAUTIONS_COLLECTION)
      .find({ deletedAt: null, lonaciClientId, produitCode: pcode })
      .sort({ updatedAt: -1 })
      .toArray();
    if (!clientRows.length) return null;
    const paid = clientRows.find((r) => r.status === "PAYEE");
    return mapCautionReference(paid ?? clientRows[0]);
  }

  if (!concessionnaireId) {
    return null;
  }

  const concessionnaire = await prisma.concessionnaire.findFirst({
    where: { id: concessionnaireId, deletedAt: null },
    select: { codePdv: true },
  });
  if (!concessionnaire?.codePdv) {
    return null;
  }

  const client = await prisma.lonaciClient.findFirst({
    where: { code: concessionnaire.codePdv, deletedAt: null },
    select: { id: true },
  });
  if (!client) {
    return null;
  }

  const clientRows = await db
    .collection<StoredCaution>(CAUTIONS_COLLECTION)
    .find({ deletedAt: null, lonaciClientId: client.id, produitCode: pcode })
    .sort({ updatedAt: -1 })
    .toArray();

  if (!clientRows.length) return null;
  const paid = clientRows.find((r) => r.status === "PAYEE");
  return mapCautionReference(paid ?? clientRows[0]);
}

function splitChecklistDocuments(checklist: DossierDocumentChecklistPayload): {
  documentsFournis: string[];
  documentsManquants: string[];
} {
  const documentsFournis: string[] = [];
  const documentsManquants: string[] = [];
  for (const entry of checklist.entries) {
    const label = entry.obligatoire ? entry.libelle : `${entry.libelle} (facultatif)`;
    if (entry.statut === "FOURNI") {
      documentsFournis.push(label);
    } else {
      const suffix =
        entry.statut === "MANQUANT"
          ? DOSSIER_CHECKLIST_STATUT_LABELS.MANQUANT
          : DOSSIER_CHECKLIST_STATUT_LABELS.EN_ATTENTE;
      documentsManquants.push(`${label} — ${suffix}`);
    }
  }
  return { documentsFournis, documentsManquants };
}

export async function buildDossierDechargeProvisoireView(
  dossierId: string,
): Promise<DossierDechargeProvisoireView | null> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt || dossier.type !== "CONTRAT_ACTUALISATION") {
    return null;
  }

  const produitCodes = getDossierProduitCodes(dossier.payload ?? {});
  const checklist = await ensureChecklistForDossierProduits(dossier.payload ?? {}, produitCodes);
  if (!dossierEligibleDechargeProvisoire(checklist, dossier.status)) {
    return null;
  }

  const party = await loadDossierContratParty(dossier);
  if (!party) {
    return null;
  }

  const parentContratId =
    typeof dossier.payload?.parentContratId === "string" ? dossier.payload.parentContratId : null;
  const explicitCautionId =
    typeof dossier.payload?.cautionId === "string" ? dossier.payload.cautionId : null;
  const cautions: DossierDechargeProvisoireCautionInfo[] = [];
  for (const pcode of produitCodes) {
    const caution = await findAssociatedCautionForDossier({
      concessionnaireId: dossier.concessionnaireId,
      lonaciClientId: dossier.lonaciClientId,
      produitCode: pcode,
      parentContratId,
      explicitCautionId,
    });
    if (caution) cautions.push(caution);
  }

  const produits = await Promise.all(produitCodes.map((code) => resolveProduitForContratWorkflow(code)));
  const produitLibelles = produitCodes.map((code, i) => produits[i]?.libelle ?? code);
  const primaryCode = produitCodes[0] ?? "—";

  const db = await getDatabase();
  const agenceMap = await loadAgenceLibelleMap(
    db,
    party.agenceId ? [party.agenceId] : [],
  );
  const agenceLabel = party.agenceId
    ? formatAgenceLibelle(agenceMap.get(party.agenceId), party.agenceId)
    : "Sans agence";

  const { documentsFournis, documentsManquants } = splitChecklistDocuments(checklist);

  return {
    dossierReference: dossier.reference,
    dossierStatus: dossier.status,
    generatedAt: new Date(),
    identiteLabel: party.kind === "client" ? "Client" : "Concessionnaire",
    identiteDetail: party.displayName || "—",
    codePdv: party.codeLabel,
    cniNumero: party.cniNumero,
    agenceLabel,
    produitCode: primaryCode,
    produitLibelle: produitLibelles[0] ?? primaryCode,
    produitCodes,
    produitLibelles,
    documentsFournis,
    documentsManquants,
    caution: cautions[0] ?? null,
    cautions,
  };
}

export async function renderDossierDechargeProvisoirePdf(view: DossierDechargeProvisoireView): Promise<Buffer> {
  const doc = createPremiumPdfDocument({
    metadata: {
      title: DECHARGE_PROVISOIRE_TITLE,
      subject: `Décharge provisoire du dossier ${view.dossierReference}`,
      creationDate: view.generatedAt,
    },
  });
  return collectPdfBuffer(doc, () => {
    drawTitle(
      doc,
      DECHARGE_PROVISOIRE_TITLE,
      `Réf. dossier : ${view.dossierReference} · Date : ${view.generatedAt.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`,
    );
    drawStatusBadge(doc, "DOSSIER INCOMPLET", "warning");

    const identityFields: PdfField[] = [
      { label: view.identiteLabel, value: view.identiteDetail },
      { label: "Code PDV", value: view.codePdv },
      ...(view.cniNumero ? [{ label: "N° CNI", value: view.cniNumero }] : []),
      { label: "Agence", value: view.agenceLabel },
      { label: "Produit", value: `${view.produitCode} — ${view.produitLibelle}` },
    ];
    drawSection(doc, "Identification du dossier");
    drawInformationCard(doc, identityFields);

    const cautionFields: PdfField[] = view.caution
      ? [
          { label: "Réf. caution associée", value: view.caution.referenceLabel },
          ...(view.caution.numeroFicheProvisoire
            ? [{ label: "Fiche provisoire (FPC)", value: view.caution.numeroFicheProvisoire }]
            : []),
          ...(view.caution.paymentReference
            ? [{ label: "Référence de paiement", value: view.caution.paymentReference }]
            : []),
        ]
      : [{ label: "Réf. caution associée", value: "Aucune caution liée identifiée" }];
    drawSection(doc, "Caution associée");
    drawInformationCard(doc, cautionFields);

    drawSection(doc, "Documents fournis");
    drawBulletList(doc, view.documentsFournis, "Aucun document marqué comme fourni.");
    doc.y += PDF_SPACING.sm;
    drawSection(doc, "Documents manquants ou en attente");
    drawBulletList(doc, view.documentsManquants, "Aucun document en attente.");

    doc.font("Helvetica").fontSize(PDF_TYPOGRAPHY.label);
    const disclaimerHeight =
      doc.heightOfString(DECHARGE_PROVISOIRE_DISCLAIMER, { width: contentWidth(doc) }) +
      PDF_SPACING.md;
    ensureSpace(doc, disclaimerHeight);
    doc
      .fillColor(PDF_COLORS.warning)
      .text(DECHARGE_PROVISOIRE_DISCLAIMER, { width: contentWidth(doc), align: "justify" });

    finalizePremiumPages(doc, {
      reference: view.dossierReference,
      issuedAt: view.generatedAt,
      documentLabel: "DÉCHARGE PROVISOIRE",
    });
  });
}

export async function buildDechargeFromDossier(dossier: DossierDocument): Promise<DossierDechargeProvisoireView | null> {
  if (!dossier._id) return null;
  return buildDossierDechargeProvisoireView(dossier._id);
}
