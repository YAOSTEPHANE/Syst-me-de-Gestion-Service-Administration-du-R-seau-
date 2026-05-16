import "server-only";

import { ObjectId } from "mongodb";
import PDFDocument from "pdfkit";

import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  buildDossierDechargeDefinitiveView,
  dossierEligibleDechargeDefinitive,
} from "@/lib/lonaci/dossier-decharge-definitive";
import { findAssociatedCautionForDossier } from "@/lib/lonaci/dossier-decharge-provisoire";
import { findDossierById } from "@/lib/lonaci/dossiers";
import { previewNextContratReference } from "@/lib/lonaci/contracts";
import { resolveProduitForContratWorkflow } from "@/lib/lonaci/contrat-produits";
import { ensureDossierDocumentChecklist } from "@/lib/lonaci/produit-document-checklist";
import type { ConcessionnaireDocument, DossierDocument, UserDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import { saveContratArchivePdf } from "@/lib/storage/contrat-files";

export const CONTRAT_OFFICIEL_TITLE = "CONTRAT DE CONCESSION — LONACI";

export interface ContratGenereConcessionnaireSnapshot {
  nomComplet: string;
  raisonSociale: string;
  codePdv: string;
  codeTerminal: string | null;
  codeConcessionnaire: string | null;
  cniNumero: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  agenceLabel: string;
}

export interface ContratGenerePayload {
  generatedAt: string;
  generatedByUserId: string;
  dechargeDefinitiveValideeLe: string;
  referenceContratPreview: string;
  paymentReference: string;
  cautionReferenceLabel: string;
  produitCode: string;
  produitLibelle: string;
  operationType: string;
  dateEffet: string;
  concessionnaire: ContratGenereConcessionnaireSnapshot;
  contratSigneArchive?: {
    storedRelativePath: string;
    archivedAt: string;
    contratReference: string;
  };
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
  signedAt: Date | null;
  signerName: string | null;
  finalized: boolean;
}

type DossierSignatureRow = {
  status: string;
  signedAt: Date | null;
  signerName: string | null;
};

function snapshotConcessionnaire(
  conc: ConcessionnaireDocument,
  agenceLabel: string,
): ContratGenereConcessionnaireSnapshot {
  return {
    nomComplet: conc.nomComplet,
    raisonSociale: conc.raisonSociale,
    codePdv: conc.codePdv,
    codeTerminal: conc.codeTerminal,
    codeConcessionnaire: conc.codeConcessionnaire,
    cniNumero: conc.cniNumero,
    email: conc.email,
    telephone:
      conc.telephonePrincipal?.trim() ||
      conc.telephone?.trim() ||
      conc.telephoneSecondaire?.trim() ||
      null,
    adresse: conc.adresse,
    ville: conc.ville,
    codePostal: conc.codePostal,
    agenceLabel,
  };
}

export function parseContratGenerePayload(payload: Record<string, unknown> | null | undefined): ContratGenerePayload | null {
  const raw = payload?.contratGenere;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const conc = o.concessionnaire;
  if (!conc || typeof conc !== "object" || Array.isArray(conc)) return null;
  const c = conc as Record<string, unknown>;
  if (typeof o.paymentReference !== "string" || !o.paymentReference.trim()) return null;
  return {
    generatedAt: String(o.generatedAt ?? ""),
    generatedByUserId: String(o.generatedByUserId ?? ""),
    dechargeDefinitiveValideeLe: String(o.dechargeDefinitiveValideeLe ?? ""),
    referenceContratPreview: String(o.referenceContratPreview ?? ""),
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
  };
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

export async function prepareContratFromDechargeDefinitive(
  dossierId: string,
  actor: UserDocument,
): Promise<{ dossier: DossierDocument; contratGenere: ContratGenerePayload; created: boolean }> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt || dossier.type !== "CONTRAT_ACTUALISATION") {
    throw new Error("DOSSIER_NOT_FOUND");
  }

  const existing = parseContratGenerePayload(dossier.payload ?? {});
  if (existing) {
    return { dossier, contratGenere: existing, created: false };
  }

  const dechargeView = await buildDossierDechargeDefinitiveView(dossierId);
  if (!dechargeView) {
    throw new Error("DECHARGE_DEFINITIVE_REQUIRED");
  }

  const concessionnaire = await findConcessionnaireById(dossier.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    throw new Error("CONCESSIONNAIRE_NOT_FOUND");
  }

  const produitCode = String(dossier.payload?.produitCode ?? "").trim().toUpperCase();
  const operationType = String(dossier.payload?.operationType ?? "NOUVEAU");
  const dateEffetRaw = String(dossier.payload?.dateEffet ?? dossier.payload?.dateOperation ?? "");
  const dateEffet = new Date(dateEffetRaw);
  if (!produitCode || Number.isNaN(dateEffet.getTime())) {
    throw new Error("DOSSIER_PAYLOAD_INVALID");
  }

  const produit = await resolveProduitForContratWorkflow(produitCode);
  const previewRef = await previewNextContratReference(produitCode, dateEffet);
  const nowIso = new Date().toISOString();

  const contratGenere: ContratGenerePayload = {
    generatedAt: nowIso,
    generatedByUserId: actor._id ?? "",
    dechargeDefinitiveValideeLe: nowIso,
    referenceContratPreview: previewRef,
    paymentReference: dechargeView.paymentReference,
    cautionReferenceLabel: dechargeView.cautionReferenceLabel,
    produitCode,
    produitLibelle: produit?.libelle ?? produitCode,
    operationType,
    dateEffet: dateEffet.toISOString(),
    concessionnaire: snapshotConcessionnaire(concessionnaire, dechargeView.agenceLabel),
  };

  const db = await getDatabase();
  const nextPayload = { ...(dossier.payload ?? {}), contratGenere };
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

  return { dossier: updated, contratGenere, created: true };
}

export async function buildContratDocumentView(
  dossierId: string,
  contratReference?: string,
): Promise<ContratDocumentView | null> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt) return null;

  const genere = parseContratGenerePayload(dossier.payload ?? {});
  if (!genere) return null;

  const checklist = ensureDossierDocumentChecklist(
    dossier.payload ?? {},
    (await resolveProduitForContratWorkflow(genere.produitCode))?.documentsChecklist ?? [],
  );
  const documentsFournis = checklist.entries
    .filter((e) => e.statut === "FOURNI")
    .map((e) => e.libelle);

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
    signedAt: signature?.signedAt ?? null,
    signerName: signature?.signerName ?? null,
    finalized: dossier.status === "FINALISE",
  };
}

function drawHeader(doc: InstanceType<typeof PDFDocument>, finalized: boolean) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left;
  doc.save();
  doc.rect(x, doc.y, w, 52).fill("#0f3d2e");
  doc.fillColor("#ffffff").fontSize(11).text("LONACI", x + 14, doc.y - 44);
  doc.fontSize(8).text("Loterie Nationale de Côte d’Ivoire", x + 14, doc.y + 2);
  doc.fontSize(7).text("Document officiel — module Contrats", x + 14, doc.y + 2);
  doc.restore();
  doc.moveDown(3.2);
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

export async function archiveContratSigneForDossier(
  dossierId: string,
  contratReference: string,
  actor: UserDocument,
): Promise<ContratGenerePayload> {
  const view = await buildContratDocumentView(dossierId, contratReference);
  if (!view) throw new Error("CONTRAT_GENERE_MISSING");
  view.finalized = true;
  view.contratReference = contratReference;

  const pdf = await renderContratDocumentPdf(view);
  const storedRelativePath = await saveContratArchivePdf(dossierId, contratReference, pdf);

  const dossier = await findDossierById(dossierId);
  const genere = parseContratGenerePayload(dossier?.payload ?? {});
  if (!genere) throw new Error("CONTRAT_GENERE_MISSING");

  const archive = {
    storedRelativePath,
    archivedAt: new Date().toISOString(),
    contratReference,
  };
  const nextGenere: ContratGenerePayload = { ...genere, contratSigneArchive: archive };
  const db = await getDatabase();
  await db.collection("dossiers").updateOne(
    { _id: new ObjectId(dossierId), deletedAt: null },
    {
      $set: {
        "payload.contratGenere": nextGenere,
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
  const produitCode = String(dossier.payload?.produitCode ?? "").trim().toUpperCase();
  const produit = produitCode ? await resolveProduitForContratWorkflow(produitCode) : null;
  const checklist = ensureDossierDocumentChecklist(dossier.payload ?? {}, produit?.documentsChecklist ?? []);
  const parentContratId =
    typeof dossier.payload?.parentContratId === "string" ? dossier.payload.parentContratId : null;
  const explicitCautionId =
    typeof dossier.payload?.cautionId === "string" ? dossier.payload.cautionId : null;
  const cautionLink = produitCode
    ? await findAssociatedCautionForDossier(
        dossier.concessionnaireId,
        produitCode,
        parentContratId,
        explicitCautionId,
      )
    : null;
  const paid = cautionLink?.status === "PAYEE" && Boolean(cautionLink.paymentReference);
  return dossierEligibleDechargeDefinitive(checklist, paid, Boolean(cautionLink?.paymentReference));
}

/** Lance une erreur métier si la finalisation contrat n'est pas autorisée. */
export async function ensureContratFinalizationReady(dossierId: string): Promise<void> {
  const eligible = await assertDechargeDefinitiveEligible(dossierId);
  if (!eligible) {
    throw new Error("DECHARGE_DEFINITIVE_REQUIRED");
  }
}
