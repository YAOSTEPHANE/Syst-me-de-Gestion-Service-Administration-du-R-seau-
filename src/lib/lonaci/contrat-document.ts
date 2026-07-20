import "server-only";

import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

import { loadPartySnapshotForDossier, type ContratPartySnapshot } from "@/lib/lonaci/contrat-party-snapshot";
import { dossierEligibleDechargeDefinitive } from "@/lib/lonaci/dossier-decharge-constants";
import { buildDossierDechargeDefinitiveView } from "@/lib/lonaci/dossier-decharge-definitive";
import { findDossierById } from "@/lib/lonaci/dossiers";
import {
  getDossierProduitCodes,
  resolveDossierCautionsStatus,
  ensureChecklistForDossierProduits,
} from "@/lib/lonaci/dossier-produits";
import { previewNextContratReference } from "@/lib/lonaci/contracts";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";
import {
  mergeProductAnnexeTemplates,
  mergeProductChecklistTemplates,
} from "@/lib/lonaci/produit-document-checklist";
import { listProduits } from "@/lib/lonaci/referentials";
import type { DossierDocument, DossierDocumentChecklistPayload, UserDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import { saveAnnexeArchivePdf, saveContratArchivePdf } from "@/lib/storage/contrat-files";

export const CONTRAT_OFFICIEL_TITLE = "CONTRAT DE CONCESSION — LONACI";
export const CONTRAT_ANNEXE_TITLE = "ANNEXE AU CONTRAT DE CONCESSION — LONACI";

export type ContratGenereConcessionnaireSnapshot = ContratPartySnapshot;

export interface ContratArchiveMeta {
  storedRelativePath: string;
  archivedAt: string;
  contratReference: string;
}

export interface AnnexeArchiveMeta {
  storedRelativePath: string;
  archivedAt: string;
  annexeReference: string;
}

export interface ContratGenerePayload {
  generatedAt: string;
  generatedByUserId: string;
  dechargeDefinitiveValideeLe: string;
  referenceContratPreview: string;
  referenceAnnexePreview: string;
  paymentReference: string;
  cautionReferenceLabel: string;
  produitCode: string;
  produitLibelle: string;
  operationType: string;
  dateEffet: string;
  concessionnaire: ContratGenereConcessionnaireSnapshot;
  contratSigneArchive?: ContratArchiveMeta;
  annexeSigneArchive?: AnnexeArchiveMeta;
  /** Libellés des documents annexe attendus pour ce contrat (référentiel produit). */
  documentsAnnexeAttendus?: string[];
}

export interface AnnexeDocumentView extends ContratDocumentView {
  annexeReference: string;
  contratParentReference: string;
}

export function referenceAnnexeFromContrat(referenceContrat: string): string {
  const ref = referenceContrat.trim();
  if (!ref) return "";
  if (ref.startsWith("CONTRAT-")) return `ANNEXE-${ref.slice("CONTRAT-".length)}`;
  return `ANNEXE-${ref}`;
}

export interface ContratDocumentView {
  dossierReference: string;
  contratReference: string;
  generatedAt: Date;
  dateEffet: Date;
  operationType: string;
  produitCode: string;
  produitLibelle: string;
  paymentReference: string;
  cautionReferenceLabel: string;
  concessionnaire: ContratGenereConcessionnaireSnapshot;
  documentsFournis: string[];
  /** Documents annexe associés au contrat (pièces marquées fournies). */
  documentsAnnexeAssocies: string[];
  signedAt: Date | null;
  signerName: string | null;
  finalized: boolean;
}

type DossierSignatureRow = {
  status: string;
  signedAt: Date | null;
  signerName: string | null;
};

export function parseContratGenerePayload(payload: Record<string, unknown> | null | undefined): ContratGenerePayload | null {
  return parseContratGenereRecord(payload?.contratGenere);
}

function parseContratGenereRecord(raw: unknown): ContratGenerePayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const conc = o.concessionnaire;
  if (!conc || typeof conc !== "object" || Array.isArray(conc)) return null;
  const c = conc as Record<string, unknown>;
  if (typeof o.paymentReference !== "string" || !o.paymentReference.trim()) return null;
  const referenceContratPreview = String(o.referenceContratPreview ?? "");
  const referenceAnnexePreview =
    typeof o.referenceAnnexePreview === "string" && o.referenceAnnexePreview.trim()
      ? o.referenceAnnexePreview.trim()
      : referenceAnnexeFromContrat(referenceContratPreview);
  return {
    generatedAt: String(o.generatedAt ?? ""),
    generatedByUserId: String(o.generatedByUserId ?? ""),
    dechargeDefinitiveValideeLe: String(o.dechargeDefinitiveValideeLe ?? ""),
    referenceContratPreview,
    referenceAnnexePreview,
    paymentReference: o.paymentReference.trim(),
    cautionReferenceLabel: String(o.cautionReferenceLabel ?? ""),
    produitCode: String(o.produitCode ?? ""),
    produitLibelle: String(o.produitLibelle ?? ""),
    operationType: String(o.operationType ?? ""),
    dateEffet: String(o.dateEffet ?? ""),
    concessionnaire: {
      nomComplet: String(c.nomComplet ?? ""),
      raisonSociale: String(c.raisonSociale ?? ""),
      codePdv: String(c.codePdv ?? ""),
      codeTerminal: c.codeTerminal != null ? String(c.codeTerminal) : null,
      codeConcessionnaire: c.codeConcessionnaire != null ? String(c.codeConcessionnaire) : null,
      cniNumero: c.cniNumero != null ? String(c.cniNumero) : null,
      email: c.email != null ? String(c.email) : null,
      telephone: c.telephone != null ? String(c.telephone) : null,
      adresse: c.adresse != null ? String(c.adresse) : null,
      ville: c.ville != null ? String(c.ville) : null,
      codePostal: c.codePostal != null ? String(c.codePostal) : null,
      agenceLabel: String(c.agenceLabel ?? ""),
    },
    contratSigneArchive:
      o.contratSigneArchive && typeof o.contratSigneArchive === "object" && !Array.isArray(o.contratSigneArchive)
        ? {
            storedRelativePath: String((o.contratSigneArchive as Record<string, unknown>).storedRelativePath ?? ""),
            archivedAt: String((o.contratSigneArchive as Record<string, unknown>).archivedAt ?? ""),
            contratReference: String((o.contratSigneArchive as Record<string, unknown>).contratReference ?? ""),
          }
        : undefined,
    annexeSigneArchive:
      o.annexeSigneArchive && typeof o.annexeSigneArchive === "object" && !Array.isArray(o.annexeSigneArchive)
        ? {
            storedRelativePath: String((o.annexeSigneArchive as Record<string, unknown>).storedRelativePath ?? ""),
            archivedAt: String((o.annexeSigneArchive as Record<string, unknown>).archivedAt ?? ""),
            annexeReference: String((o.annexeSigneArchive as Record<string, unknown>).annexeReference ?? ""),
          }
        : undefined,
    documentsAnnexeAttendus: Array.isArray(o.documentsAnnexeAttendus)
      ? o.documentsAnnexeAttendus.map((x) => String(x).trim()).filter(Boolean)
      : undefined,
  };
}

export function parseContratsGeneresPayload(
  payload: Record<string, unknown> | null | undefined,
): ContratGenerePayload[] {
  const raw = payload?.contratsGeneres;
  if (Array.isArray(raw)) {
    const parsed = raw.map((item) => parseContratGenereRecord(item)).filter((x): x is ContratGenerePayload => x !== null);
    if (parsed.length) return parsed;
  }
  const single = parseContratGenerePayload(payload);
  return single ? [single] : [];
}

async function loadLatestSignature(dossierId: string): Promise<DossierSignatureRow | null> {
  const db = await getDatabase();
  const row = await db
    .collection<DossierSignatureRow & { dossierId: string }>("dossier_signatures")
    .find({ dossierId, status: "SIGNED" })
    .sort({ signedAt: -1 })
    .limit(1)
    .next();
  return row ?? null;
}

async function resolveDocumentListsForProduit(
  checklist: DossierDocumentChecklistPayload,
  produitCode: string,
): Promise<{ documentsFournis: string[]; documentsAnnexeAssocies: string[] }> {
  const produits = await listProduits();
  const pcode = produitCode.trim().toUpperCase();
  const dossierIds = new Set(mergeProductChecklistTemplates([pcode], produits).map((i) => i.id));
  const annexeIds = new Set(mergeProductAnnexeTemplates([pcode], produits).map((i) => i.id));
  const documentsFournis: string[] = [];
  const documentsAnnexeAssocies: string[] = [];
  for (const entry of checklist.entries) {
    if (entry.statut !== "FOURNI") continue;
    if (entry.annexe || annexeIds.has(entry.itemId)) {
      if (annexeIds.has(entry.itemId)) documentsAnnexeAssocies.push(entry.libelle);
    } else if (dossierIds.has(entry.itemId)) {
      documentsFournis.push(entry.libelle);
    }
  }
  return { documentsFournis, documentsAnnexeAssocies };
}

export async function prepareContratFromDechargeDefinitive(
  dossierId: string,
  actor: UserDocument,
): Promise<{
  dossier: DossierDocument;
  contratGenere: ContratGenerePayload;
  contratsGeneres: ContratGenerePayload[];
  created: boolean;
}> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt || dossier.type !== "CONTRAT_ACTUALISATION") {
    throw new Error("DOSSIER_NOT_FOUND");
  }

  const existingList = parseContratsGeneresPayload(dossier.payload ?? {});
  if (existingList.length) {
    return {
      dossier,
      contratGenere: existingList[0],
      contratsGeneres: existingList,
      created: false,
    };
  }

  const dechargeView = await buildDossierDechargeDefinitiveView(dossierId);
  if (!dechargeView) {
    throw new Error("DECHARGE_DEFINITIVE_REQUIRED");
  }

  const partySnapshot = await loadPartySnapshotForDossier(dossier);
  if (!partySnapshot) {
    throw new Error("PARTY_NOT_FOUND");
  }

  const produitCodes = getDossierProduitCodes(dossier.payload ?? {});
  const operationType = String(dossier.payload?.operationType ?? "NOUVEAU");
  const dateEffetRaw = String(dossier.payload?.dateEffet ?? dossier.payload?.dateOperation ?? "");
  const dateEffet = new Date(dateEffetRaw);
  if (!produitCodes.length || Number.isNaN(dateEffet.getTime())) {
    throw new Error("DOSSIER_PAYLOAD_INVALID");
  }

  const cautionsStatus = await resolveDossierCautionsStatus(dossier);
  const nowIso = new Date().toISOString();
  const contratsGeneres: ContratGenerePayload[] = [];
  const allProduits = await listProduits();

  for (const produitCode of produitCodes) {
    const produit = await resolveProduitForContratWorkflow(produitCode);
    const documentsAnnexeAttendus = mergeProductAnnexeTemplates([produitCode], allProduits).map((i) => i.libelle);
    const previewRef = await previewNextContratReference(produitCode, dateEffet);
    const cautionLink = cautionsStatus.links.find((l) => l.produitCode === produitCode);
    const paymentReference = cautionLink?.paymentReference ?? dechargeView.paymentReference;
    contratsGeneres.push({
      generatedAt: nowIso,
      generatedByUserId: actor._id ?? "",
      dechargeDefinitiveValideeLe: nowIso,
      referenceContratPreview: previewRef,
      referenceAnnexePreview: referenceAnnexeFromContrat(previewRef),
      paymentReference,
      cautionReferenceLabel: cautionLink?.referenceLabel ?? dechargeView.cautionReferenceLabel,
      produitCode,
      produitLibelle: produit?.libelle ?? produitCode,
      operationType,
      dateEffet: dateEffet.toISOString(),
      concessionnaire: partySnapshot,
      documentsAnnexeAttendus,
    });
  }

  const db = await getDatabase();
  const nextPayload = {
    ...(dossier.payload ?? {}),
    contratGenere: contratsGeneres[0],
    contratsGeneres,
  };
  await db.collection("dossiers").updateOne(
    { _id: new ObjectId(dossierId), deletedAt: null },
    {
      $set: {
        payload: nextPayload,
        updatedAt: new Date(),
        updatedByUserId: actor._id ?? "",
      },
    },
  );

  const updated = await findDossierById(dossierId);
  if (!updated) throw new Error("DOSSIER_NOT_FOUND");

  return { dossier: updated, contratGenere: contratsGeneres[0], contratsGeneres, created: true };
}

export async function buildContratDocumentView(
  dossierId: string,
  contratReference?: string,
  produitCode?: string,
): Promise<ContratDocumentView | null> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt) return null;

  const allGeneres = parseContratsGeneresPayload(dossier.payload ?? {});
  if (!allGeneres.length) return null;

  const pcode = produitCode?.trim().toUpperCase();
  const genere =
    (pcode ? allGeneres.find((g) => g.produitCode.trim().toUpperCase() === pcode) : null) ??
    (contratReference?.trim()
      ? allGeneres.find(
          (g) =>
            g.referenceContratPreview === contratReference.trim() ||
            g.contratSigneArchive?.contratReference === contratReference.trim(),
        )
      : null) ??
    allGeneres[0];

  const produitCodes = getDossierProduitCodes(dossier.payload ?? {});
  const checklist = await ensureChecklistForDossierProduits(dossier.payload ?? {}, produitCodes);
  const { documentsFournis, documentsAnnexeAssocies } = await resolveDocumentListsForProduit(
    checklist,
    genere.produitCode,
  );

  const signature = await loadLatestSignature(dossierId);
  const ref = contratReference?.trim() || genere.contratSigneArchive?.contratReference || genere.referenceContratPreview;

  return {
    dossierReference: dossier.reference,
    contratReference: ref,
    generatedAt: new Date(genere.generatedAt),
    dateEffet: new Date(genere.dateEffet),
    operationType: genere.operationType,
    produitCode: genere.produitCode,
    produitLibelle: genere.produitLibelle,
    paymentReference: genere.paymentReference,
    cautionReferenceLabel: genere.cautionReferenceLabel,
    concessionnaire: genere.concessionnaire,
    documentsFournis,
    documentsAnnexeAssocies,
    signedAt: signature?.signedAt ?? null,
    signerName: signature?.signerName ?? null,
    finalized: dossier.status === "FINALISE",
  };
}

function drawHeader(doc: InstanceType<typeof PDFDocument>, finalized: boolean) {
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const topY = doc.page.margins.top;
  const bandH = 52;
  doc.save();
  doc.rect(x, topY, w, bandH).fill("#0f3d2e");
  doc.fillColor("#ffffff").fontSize(11).text("LONACI", x + 14, topY + 10);
  doc.fontSize(8).text("Loterie Nationale de Côte d’Ivoire", x + 14, topY + 26);
  doc.fontSize(7).text("Document officiel — module Contrats", x + 14, topY + 38);
  doc.restore();
  doc.y = topY + bandH + 14;
  doc.fillColor("#111827").fontSize(13).text(CONTRAT_OFFICIEL_TITLE, { align: "center" });
  doc.moveDown(0.35);
  doc
    .fontSize(10)
    .fillColor(finalized ? "#047857" : "#6b7280")
    .text(finalized ? "CONTRAT SIGNÉ ET ARCHIVÉ" : "PROJET DE CONTRAT — EN CIRCUIT DE VALIDATION", {
      align: "center",
      underline: finalized,
    });
  doc.moveDown(0.8);
}

function drawField(doc: InstanceType<typeof PDFDocument>, label: string, value: string) {
  const y = doc.y;
  doc.fontSize(9).fillColor("#6b7280").text(label, doc.page.margins.left, y, { width: 170 });
  doc.fontSize(10).fillColor("#111827").text(value, doc.page.margins.left + 175, y, {
    width: doc.page.width - doc.page.margins.right - doc.page.margins.left - 180,
    align: "right",
  });
  doc.moveDown(0.55);
}

export async function renderContratDocumentPdf(view: ContratDocumentView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawHeader(doc, view.finalized);
    doc.fontSize(9).fillColor("#374151").text(`Réf. contrat : ${view.contratReference}`, { align: "center" });
    doc.text(`Réf. dossier : ${view.dossierReference}`, { align: "center" });
    doc.moveDown(0.8);

    doc.fontSize(10).fillColor("#111827").text("Identité du concessionnaire", { underline: true });
    doc.moveDown(0.4);
    drawField(doc, "Nom complet", view.concessionnaire.nomComplet);
    drawField(doc, "Raison sociale", view.concessionnaire.raisonSociale);
    drawField(doc, "Code PDV", view.concessionnaire.codePdv);
    if (view.concessionnaire.codeTerminal) drawField(doc, "Code terminal", view.concessionnaire.codeTerminal);
    if (view.concessionnaire.codeConcessionnaire) {
      drawField(doc, "Code concessionnaire", view.concessionnaire.codeConcessionnaire);
    }
    if (view.concessionnaire.cniNumero) drawField(doc, "N° CNI", view.concessionnaire.cniNumero);
    if (view.concessionnaire.email) drawField(doc, "E-mail", view.concessionnaire.email);
    if (view.concessionnaire.telephone) drawField(doc, "Téléphone", view.concessionnaire.telephone);
    if (view.concessionnaire.adresse) drawField(doc, "Adresse", view.concessionnaire.adresse);
    if (view.concessionnaire.ville) drawField(doc, "Ville", view.concessionnaire.ville);
    drawField(doc, "Agence", view.concessionnaire.agenceLabel);

    doc.moveDown(0.3);
    doc.fontSize(10).text("Conditions du contrat", { underline: true });
    doc.moveDown(0.4);
    drawField(doc, "Produit", `${view.produitCode} — ${view.produitLibelle}`);
    drawField(doc, "Type d’opération", view.operationType);
    drawField(
      doc,
      "Date d’effet",
      view.dateEffet.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }),
    );
    drawField(doc, "Réf. caution", view.cautionReferenceLabel);

    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#047857").text("Référence de paiement de la caution", { underline: true });
    doc.moveDown(0.25);
    doc.fontSize(12).fillColor("#065f46").text(view.paymentReference, { align: "center" });
    doc.moveDown(0.8);

    doc.fontSize(10).fillColor("#111827").text("Documents fournis (checklist validée)", { underline: true });
    doc.moveDown(0.35);
    if (!view.documentsFournis.length) {
      doc.fontSize(9).fillColor("#6b7280").text("—");
    } else {
      doc.fontSize(9).fillColor("#374151");
      for (const d of view.documentsFournis) doc.text(`• ${d}`);
    }

    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#111827").text("Documents annexe associés au contrat", { underline: true });
    doc.moveDown(0.35);
    if (!view.documentsAnnexeAssocies.length) {
      doc.fontSize(9).fillColor("#6b7280").text("— (configurer dans le référentiel produit)");
    } else {
      doc.fontSize(9).fillColor("#374151");
      for (const d of view.documentsAnnexeAssocies) doc.text(`• ${d}`);
    }

    if (view.signedAt && view.signerName) {
      doc.moveDown(0.8);
      drawField(
        doc,
        "Signature électronique",
        `${view.signerName} — ${view.signedAt.toLocaleString("fr-FR")}`,
      );
    }

    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        view.finalized
          ? "Contrat archivé après validation finale (Chef de Service). Le concessionnaire est actif dans le système."
          : "Ce contrat est soumis au circuit de validation à 4 niveaux (soumission, N1, N2, finalisation).",
        { align: "justify" },
      );

    doc.end();
  });
}

function drawAnnexeHeader(doc: InstanceType<typeof PDFDocument>, finalized: boolean) {
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const topY = doc.page.margins.top;
  const bandH = 52;
  doc.save();
  doc.rect(x, topY, w, bandH).fill("#1e3a5f");
  doc.fillColor("#ffffff").fontSize(11).text("LONACI", x + 14, topY + 10);
  doc.fontSize(8).text("Loterie Nationale de Côte d’Ivoire", x + 14, topY + 26);
  doc.fontSize(7).text("Document officiel — annexe contrat", x + 14, topY + 38);
  doc.restore();
  doc.y = topY + bandH + 14;
  doc.fillColor("#111827").fontSize(13).text(CONTRAT_ANNEXE_TITLE, { align: "center" });
  doc.moveDown(0.35);
  doc
    .fontSize(10)
    .fillColor(finalized ? "#047857" : "#6b7280")
    .text(finalized ? "ANNEXE SIGNÉE ET ARCHIVÉE" : "PROJET D’ANNEXE — EN CIRCUIT DE VALIDATION", {
      align: "center",
      underline: finalized,
    });
  doc.moveDown(0.8);
}

export async function buildAnnexeDocumentView(
  dossierId: string,
  annexeReference?: string,
  produitCode?: string,
): Promise<AnnexeDocumentView | null> {
  const view = await buildContratDocumentView(dossierId, undefined, produitCode);
  if (!view) return null;

  const dossier = await findDossierById(dossierId);
  const allGeneres = parseContratsGeneresPayload(dossier?.payload ?? {});
  const pcode = (produitCode ?? view.produitCode).trim().toUpperCase();
  const genere =
    allGeneres.find((g) => g.produitCode.trim().toUpperCase() === pcode) ?? allGeneres[0];
  if (!genere) return null;

  const annexeRef =
    annexeReference?.trim() ||
    genere.annexeSigneArchive?.annexeReference ||
    genere.referenceAnnexePreview;

  return {
    ...view,
    annexeReference: annexeRef,
    contratParentReference:
      genere.contratSigneArchive?.contratReference || genere.referenceContratPreview,
  };
}

export async function renderAnnexeDocumentPdf(view: AnnexeDocumentView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawAnnexeHeader(doc, view.finalized);
    doc.fontSize(9).fillColor("#374151").text(`Réf. annexe : ${view.annexeReference}`, { align: "center" });
    doc.text(`Contrat parent : ${view.contratParentReference}`, { align: "center" });
    doc.text(`Réf. dossier : ${view.dossierReference}`, { align: "center" });
    doc.moveDown(0.8);

    doc.fontSize(10).fillColor("#111827").text("Produit concerné", { underline: true });
    doc.moveDown(0.4);
    drawField(doc, "Produit", `${view.produitCode} — ${view.produitLibelle}`);
    drawField(doc, "Type d’opération", view.operationType);
    drawField(
      doc,
      "Date d’effet",
      view.dateEffet.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }),
    );
    drawField(doc, "Réf. caution", view.cautionReferenceLabel);
    drawField(doc, "Réf. paiement caution", view.paymentReference);

    doc.moveDown(0.3);
    doc.fontSize(10).text("Titulaire", { underline: true });
    doc.moveDown(0.4);
    drawField(doc, "Nom complet", view.concessionnaire.nomComplet);
    drawField(doc, "Raison sociale", view.concessionnaire.raisonSociale);
    drawField(doc, "Code PDV", view.concessionnaire.codePdv);
    drawField(doc, "Agence", view.concessionnaire.agenceLabel);

    doc.moveDown(0.3);
    doc.fontSize(10).text("Documents annexe associés", { underline: true });
    doc.moveDown(0.35);
    if (!view.documentsAnnexeAssocies.length) {
      doc.fontSize(9).fillColor("#6b7280").text("—");
    } else {
      doc.fontSize(9).fillColor("#374151");
      for (const d of view.documentsAnnexeAssocies) doc.text(`• ${d}`);
    }

    doc.moveDown(0.3);
    doc.fontSize(10).text("Autres pièces du dossier (hors annexe)", { underline: true });
    doc.moveDown(0.35);
    if (!view.documentsFournis.length) {
      doc.fontSize(9).fillColor("#6b7280").text("—");
    } else {
      doc.fontSize(9).fillColor("#374151");
      for (const d of view.documentsFournis) doc.text(`• ${d}`);
    }

    if (view.signedAt && view.signerName) {
      doc.moveDown(0.8);
      drawField(
        doc,
        "Signature électronique",
        `${view.signerName} — ${view.signedAt.toLocaleString("fr-FR")}`,
      );
    }

    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        view.finalized
          ? "Annexe archivée avec le contrat après validation finale (Chef de Service)."
          : "Cette annexe accompagne le contrat et suit le même circuit de validation à 4 niveaux.",
        { align: "justify" },
      );

    doc.end();
  });
}

export async function archiveAnnexeSigneForDossier(
  dossierId: string,
  annexeReference: string,
  actor: UserDocument,
  produitCode?: string,
): Promise<ContratGenerePayload> {
  const view = await buildAnnexeDocumentView(dossierId, annexeReference, produitCode);
  if (!view) throw new Error("CONTRAT_GENERE_MISSING");
  view.finalized = true;
  view.annexeReference = annexeReference;

  const pdf = await renderAnnexeDocumentPdf(view);
  const storedRelativePath = await saveAnnexeArchivePdf(dossierId, annexeReference, pdf);

  const dossier = await findDossierById(dossierId);
  const allGeneres = parseContratsGeneresPayload(dossier?.payload ?? {});
  if (!allGeneres.length) throw new Error("CONTRAT_GENERE_MISSING");

  const pcode = (produitCode ?? view.produitCode).trim().toUpperCase();
  const archive = {
    storedRelativePath,
    archivedAt: new Date().toISOString(),
    annexeReference,
  };
  const contratsGeneres = allGeneres.map((g) =>
    g.produitCode.trim().toUpperCase() === pcode ? { ...g, annexeSigneArchive: archive } : g,
  );
  const nextGenere = contratsGeneres.find((g) => g.produitCode.trim().toUpperCase() === pcode) ?? contratsGeneres[0];

  const db = await getDatabase();
  await db.collection("dossiers").updateOne(
    { _id: new ObjectId(dossierId), deletedAt: null },
    {
      $set: {
        "payload.contratGenere": nextGenere,
        "payload.contratsGeneres": contratsGeneres,
        updatedAt: new Date(),
        updatedByUserId: actor._id ?? "",
      },
    },
  );
  return nextGenere;
}

export interface ContratProduitSummary {
  produitCode: string;
  produitLibelle: string;
  referenceContratPreview: string;
  referenceAnnexePreview: string;
  documentsAnnexeAttendus: string[];
  hasContratGenere: boolean;
  contratArchive: boolean;
  annexeArchive: boolean;
}

export function contratProduitSummaryFromPayload(
  payload: Record<string, unknown> | null | undefined,
  produitCode: string,
): ContratProduitSummary | null {
  const pcode = produitCode.trim().toUpperCase();
  const genere = parseContratsGeneresPayload(payload).find(
    (g) => g.produitCode.trim().toUpperCase() === pcode,
  );
  if (!genere) return null;
  return {
    produitCode: genere.produitCode,
    produitLibelle: genere.produitLibelle,
    referenceContratPreview: genere.referenceContratPreview,
    referenceAnnexePreview: genere.referenceAnnexePreview,
    documentsAnnexeAttendus: genere.documentsAnnexeAttendus ?? [],
    hasContratGenere: true,
    contratArchive: Boolean(genere.contratSigneArchive),
    annexeArchive: Boolean(genere.annexeSigneArchive),
  };
}

export function summarizeContratsParProduit(
  payload: Record<string, unknown> | null | undefined,
): ContratProduitSummary[] {
  return parseContratsGeneresPayload(payload).map((g) => ({
    produitCode: g.produitCode,
    produitLibelle: g.produitLibelle,
    referenceContratPreview: g.referenceContratPreview,
    referenceAnnexePreview: g.referenceAnnexePreview,
    documentsAnnexeAttendus: g.documentsAnnexeAttendus ?? [],
    hasContratGenere: true,
    contratArchive: Boolean(g.contratSigneArchive),
    annexeArchive: Boolean(g.annexeSigneArchive),
  }));
}

export function allContratsArchivesComplete(payload: Record<string, unknown> | null | undefined): boolean {
  const list = parseContratsGeneresPayload(payload);
  return list.length > 0 && list.every((g) => Boolean(g.contratSigneArchive));
}

export function allAnnexesArchivesComplete(payload: Record<string, unknown> | null | undefined): boolean {
  const list = parseContratsGeneresPayload(payload);
  return list.length > 0 && list.every((g) => Boolean(g.annexeSigneArchive));
}

export async function archiveContratSigneForDossier(
  dossierId: string,
  contratReference: string,
  actor: UserDocument,
  produitCode?: string,
): Promise<ContratGenerePayload> {
  const view = await buildContratDocumentView(dossierId, contratReference, produitCode);
  if (!view) throw new Error("CONTRAT_GENERE_MISSING");
  view.finalized = true;
  view.contratReference = contratReference;

  const pdf = await renderContratDocumentPdf(view);
  const storedRelativePath = await saveContratArchivePdf(dossierId, contratReference, pdf);

  const dossier = await findDossierById(dossierId);
  const allGeneres = parseContratsGeneresPayload(dossier?.payload ?? {});
  if (!allGeneres.length) throw new Error("CONTRAT_GENERE_MISSING");

  const pcode = (produitCode ?? view.produitCode).trim().toUpperCase();
  const archive = {
    storedRelativePath,
    archivedAt: new Date().toISOString(),
    contratReference,
  };
  const contratsGeneres = allGeneres.map((g) =>
    g.produitCode.trim().toUpperCase() === pcode ? { ...g, contratSigneArchive: archive } : g,
  );
  const nextGenere = contratsGeneres.find((g) => g.produitCode.trim().toUpperCase() === pcode) ?? contratsGeneres[0];

  const db = await getDatabase();
  await db.collection("dossiers").updateOne(
    { _id: new ObjectId(dossierId), deletedAt: null },
    {
      $set: {
        "payload.contratGenere": nextGenere,
        "payload.contratsGeneres": contratsGeneres,
        updatedAt: new Date(),
        updatedByUserId: actor._id ?? "",
      },
    },
  );
  return nextGenere;
}

export async function assertDechargeDefinitiveEligible(dossierId: string): Promise<boolean> {
  const dossier = await findDossierById(dossierId);
  if (!dossier) return false;
  const produitCodes = getDossierProduitCodes(dossier.payload ?? {});
  const checklist = await ensureChecklistForDossierProduits(dossier.payload ?? {}, produitCodes);
  const cautionsStatus = await resolveDossierCautionsStatus(dossier);
  return dossierEligibleDechargeDefinitive(
    checklist,
    cautionsStatus.allPaid,
    Boolean(cautionsStatus.primaryPaymentReference),
  );
}

/** Lance une erreur métier si la finalisation contrat n'est pas autorisée. */
export async function ensureContratFinalizationReady(dossierId: string): Promise<void> {
  const eligible = await assertDechargeDefinitiveEligible(dossierId);
  if (!eligible) {
    throw new Error("DECHARGE_DEFINITIVE_REQUIRED");
  }
}
