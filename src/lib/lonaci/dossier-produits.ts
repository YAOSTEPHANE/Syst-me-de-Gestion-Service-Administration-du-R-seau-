import "server-only";

import { ObjectId } from "mongodb";

import type { ContratPartyRef } from "@/lib/lonaci/dossier-contrat-party";
import { findAssociatedCautionForDossier } from "@/lib/lonaci/dossier-decharge-provisoire";
import type { DossierDocument } from "@/lib/lonaci/types";
import { hasActiveContractForParty } from "@/lib/lonaci/contracts";
import { produitAutorisePourConcessionnaire } from "@/lib/lonaci/contrat-produits";
import { listProduits } from "@/lib/lonaci/referentials";
import {
  ensureDossierDocumentChecklist,
  mergeProductDossierAndAnnexeTemplates,
  serializeDocumentChecklistPayload,
} from "@/lib/lonaci/produit-document-checklist";
import type { DossierDocumentChecklistPayload, UserDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";

const DOSSIER_COLLECTION = "dossiers";

const EDITABLE_DOSSIER_STATUSES = new Set(["BROUILLON", "REJETE"]);

type StoredDossier = Omit<DossierDocument, "_id"> & { _id: ObjectId };

function mapDossierRow(row: StoredDossier): DossierDocument {
  return { ...row, _id: row._id.toHexString() };
}

async function loadDossierById(id: string): Promise<DossierDocument | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  const row = await db.collection<StoredDossier>(DOSSIER_COLLECTION).findOne({ _id: new ObjectId(id) });
  return row ? mapDossierRow(row) : null;
}

/** Codes produit d'un dossier contrat (rétrocompat : `produitCode` seul). */
export function getDossierProduitCodes(payload: Record<string, unknown> | null | undefined): string[] {
  const raw = payload?.produitCodes;
  if (Array.isArray(raw)) {
    const codes = raw
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    if (codes.length) {
      return [...new Set(codes)];
    }
  }
  const single = String(payload?.produitCode ?? "").trim().toUpperCase();
  return single ? [single] : [];
}

export function serializeDossierProduitPayload(codes: string[]): {
  produitCode: string;
  produitCodes: string[];
} {
  const produitCodes = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  return {
    produitCode: produitCodes[0] ?? "",
    produitCodes,
  };
}

export interface DossierCautionLink {
  produitCode: string;
  cautionId: string;
  status: string;
  paymentReference: string | null;
  referenceLabel: string;
}

export interface DossierCautionsStatus {
  produitCodes: string[];
  links: DossierCautionLink[];
  allPaid: boolean;
  /** Première référence de paiement (caution payée) — affichage liste. */
  primaryPaymentReference: string | null;
}

export async function resolveDossierCautionsStatus(
  dossier: Pick<DossierDocument, "concessionnaireId" | "lonaciClientId" | "payload">,
): Promise<DossierCautionsStatus> {
  const produitCodes = getDossierProduitCodes(dossier.payload ?? {});
  const parentContratId =
    typeof dossier.payload?.parentContratId === "string" ? dossier.payload.parentContratId : null;
  const explicitCautionId =
    typeof dossier.payload?.cautionId === "string" ? dossier.payload.cautionId : null;

  const links: DossierCautionLink[] = [];
  for (const produitCode of produitCodes) {
    const caution = await findAssociatedCautionForDossier({
      concessionnaireId: dossier.concessionnaireId,
      lonaciClientId: dossier.lonaciClientId,
      produitCode,
      parentContratId,
      explicitCautionId,
    });
    if (!caution) {
      links.push({
        produitCode,
        cautionId: "",
        status: "ABSENTE",
        paymentReference: null,
        referenceLabel: "—",
      });
      continue;
    }
    links.push({
      produitCode,
      cautionId: caution.cautionId,
      status: caution.status,
      paymentReference:
        caution.status === "PAYEE" && caution.paymentReference?.trim()
          ? caution.paymentReference.trim()
          : null,
      referenceLabel: caution.referenceLabel,
    });
  }

  const allPaid =
    produitCodes.length > 0 &&
    links.length === produitCodes.length &&
    links.every((l) => l.status === "PAYEE" && Boolean(l.paymentReference));
  const primaryPaymentReference = links.find((l) => l.paymentReference)?.paymentReference ?? null;

  return { produitCodes, links, allPaid, primaryPaymentReference };
}

export async function ensureChecklistForDossierProduits(
  payload: Record<string, unknown>,
  produitCodes: string[],
): Promise<DossierDocumentChecklistPayload> {
  const produits = await listProduits();
  const template = mergeProductDossierAndAnnexeTemplates(produitCodes, produits);
  return ensureDossierDocumentChecklist(payload, template);
}

/** Dossier contrat NOUVEAU encore modifiable pour le même client / PDV. */
export async function findEditableContratDossierForParty(
  party: ContratPartyRef,
): Promise<DossierDocument | null> {
  const db = await getDatabase();
  const filter: Record<string, unknown> = {
    deletedAt: null,
    type: "CONTRAT_ACTUALISATION",
    status: { $in: [...EDITABLE_DOSSIER_STATUSES] },
    "payload.operationType": "NOUVEAU",
  };
  if (party.kind === "client") {
    filter.lonaciClientId = party.lonaciClientId;
  } else {
    filter.concessionnaireId = party.concessionnaireId;
  }

  const row = await db
    .collection<StoredDossier>(DOSSIER_COLLECTION)
    .find(filter)
    .sort({ updatedAt: -1 })
    .limit(1)
    .next();
  return row ? mapDossierRow(row) : null;
}

export async function extendContratDossierWithProduit(input: {
  dossierId: string;
  produitCode: string;
  actor: UserDocument;
  documentChecklist?: Array<{ itemId: string; statut: "FOURNI" | "MANQUANT" | "EN_ATTENTE" }>;
}): Promise<{ dossier: DossierDocument; added: boolean }> {
  const dossier = await loadDossierById(input.dossierId);
  if (!dossier || dossier.deletedAt) {
    throw new Error("DOSSIER_NOT_FOUND");
  }
  if (dossier.type !== "CONTRAT_ACTUALISATION") {
    throw new Error("DOSSIER_TYPE_UNSUPPORTED");
  }
  if (!EDITABLE_DOSSIER_STATUSES.has(dossier.status)) {
    throw new Error("DOSSIER_NOT_EDITABLE");
  }
  if (String(dossier.payload?.operationType ?? "") !== "NOUVEAU") {
    throw new Error("DOSSIER_OPERATION_NOT_EXTENDABLE");
  }

  const pcode = input.produitCode.trim().toUpperCase();
  if (!pcode) {
    throw new Error("PRODUIT_REQUIRED");
  }

  const currentCodes = getDossierProduitCodes(dossier.payload ?? {});
  if (currentCodes.includes(pcode)) {
    return { dossier, added: false };
  }

  const { loadDossierContratParty, contratPartyFromDossier } = await import(
    "@/lib/lonaci/dossier-contrat-party"
  );
  const party = contratPartyFromDossier(dossier);
  if (!party) {
    throw new Error("PARTY_REQUIRED");
  }
  const partyProfile = await loadDossierContratParty(dossier);
  if (!partyProfile) {
    throw new Error("PARTY_NOT_FOUND");
  }
  if (!produitAutorisePourConcessionnaire(partyProfile.produitsAutorises ?? [], pcode)) {
    throw new Error("PRODUIT_NOT_ALLOWED");
  }

  const exists = await hasActiveContractForParty(party, pcode);
  if (exists) {
    throw new Error("ACTIVE_CONTRACT_EXISTS");
  }

  const nextCodes = [...currentCodes, pcode];
  const nextPayload = {
    ...(dossier.payload ?? {}),
    ...serializeDossierProduitPayload(nextCodes),
  };

  let checklist = await ensureChecklistForDossierProduits(nextPayload, nextCodes);
  if (input.documentChecklist?.length) {
    const { mergeChecklistStatutPatch } = await import("@/lib/lonaci/produit-document-checklist");
    checklist = mergeChecklistStatutPatch(checklist, input.documentChecklist);
  }
  Object.assign(nextPayload, serializeDocumentChecklistPayload(checklist));

  const db = await getDatabase();
  const now = new Date();
  await db.collection<StoredDossier>(DOSSIER_COLLECTION).updateOne(
    { _id: new ObjectId(input.dossierId), deletedAt: null },
    {
      $set: {
        payload: nextPayload,
        updatedAt: now,
        updatedByUserId: input.actor._id ?? "",
      },
    },
  );

  const { appendAuditLog } = await import("@/lib/lonaci/audit");
  await appendAuditLog({
    entityType: "DOSSIER",
    entityId: input.dossierId,
    action: "DOSSIER_ADD_PRODUIT",
    userId: input.actor._id ?? "",
    details: { produitCode: pcode, produitCodes: nextCodes },
  });

  const updated = await loadDossierById(input.dossierId);
  if (!updated) {
    throw new Error("DOSSIER_NOT_FOUND");
  }
  return { dossier: updated, added: true };
}

/** Ajoute plusieurs produits au dossier contrat (ignore ceux déjà présents). */
export async function extendContratDossierWithProduits(input: {
  dossierId: string;
  produitCodes: string[];
  actor: UserDocument;
  documentChecklist?: Array<{ itemId: string; statut: "FOURNI" | "MANQUANT" | "EN_ATTENTE" }>;
}): Promise<{ dossier: DossierDocument; added: string[] }> {
  const codes = [
    ...new Set(input.produitCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)),
  ];
  if (!codes.length) {
    const dossier = await loadDossierById(input.dossierId);
    if (!dossier || dossier.deletedAt) throw new Error("DOSSIER_NOT_FOUND");
    return { dossier, added: [] };
  }

  let dossier: DossierDocument | null = null;
  const added: string[] = [];
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    const result = await extendContratDossierWithProduit({
      dossierId: dossier?._id ?? input.dossierId,
      produitCode: code,
      actor: input.actor,
      documentChecklist: i === codes.length - 1 ? input.documentChecklist : undefined,
    });
    dossier = result.dossier;
    if (result.added) added.push(code);
  }

  if (!dossier) throw new Error("DOSSIER_NOT_FOUND");
  return { dossier, added };
}
