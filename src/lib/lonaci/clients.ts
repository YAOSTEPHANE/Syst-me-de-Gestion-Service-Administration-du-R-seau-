import type { Prisma } from "@prisma/client";

import { appendAuditLog } from "@/lib/lonaci/audit";
import {
  CLIENT_STATUTS,
  clientDisplayName,
  normalizeClientCategorie,
  normalizeClientCodeForAgence,
  normalizeClientTypeDistributeur,
  type ClientCategorie,
  type ClientStatut,
} from "@/lib/lonaci/client-constants";
import { patchDocumentChecklistStatuts } from "@/lib/lonaci/concessionnaire-inscription";
import { notifyRoleTargets } from "@/lib/lonaci/notifications";
import {
  buildChecklistFromTemplate,
  computeChecklistComplet,
  isChecklistStatut,
  mergeProductChecklistTemplates,
} from "@/lib/lonaci/produit-document-checklist";
import { listProduits } from "@/lib/lonaci/referentials";
import { formatAgenceLibelle, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import type { DossierDocumentChecklistPayload, ProduitDocument, UserDocument } from "@/lib/lonaci/types";
import { userDisplayName } from "@/lib/lonaci/types";

/** Fiches client actives (non désactivées) : Prisma Mongo ne matche pas `null` si la clé `deletedAt` est absente. */
export const lonaciClientNotDeletedWhere: Prisma.LonaciClientWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
};

function isObjectId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

function initialClientStatutOnCreate(): ClientStatut {
  // Plus de validation N1 à la création : le client est immédiatement utilisable pour caution/contrat.
  return "DOSSIER_EN_COURS";
}

/** Migre les fiches encore bloquées en attente N1 (statuts historiques). */
export async function promoteClientsAwaitingN1ToDossierEnCours(): Promise<number> {
  const result = await prisma.lonaciClient.updateMany({
    where: {
      AND: [lonaciClientNotDeletedWhere, { statut: "EN_ATTENTE_N1" }],
    },
    data: {
      statut: "DOSSIER_EN_COURS",
      updatedAt: new Date(),
    },
  });
  return result.count;
}

function clientValidationFieldsForSanitize(doc: {
  validationN1At: Date | null;
  validationN1ByUserId: string | null;
  rejetMotif: string | null;
  rejetAt: Date | null;
}) {
  return {
    validationN1At: doc.validationN1At ? doc.validationN1At.toISOString() : null,
    validationN1ByUserId: doc.validationN1ByUserId,
    rejetMotif: doc.rejetMotif,
    rejetAt: doc.rejetAt ? doc.rejetAt.toISOString() : null,
  };
}

export function parseClientDocumentChecklist(
  raw: unknown,
): DossierDocumentChecklistPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.entries)) return null;
  const entries = obj.entries
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const itemId = String(r.itemId ?? "").trim();
      const libelle = String(r.libelle ?? "").trim();
      if (!itemId || !libelle) return null;
      const statut = isChecklistStatut(r.statut) ? r.statut : "EN_ATTENTE";
      return {
        itemId,
        libelle,
        obligatoire: r.obligatoire !== false,
        statut,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
  const complet =
    typeof obj.complet === "boolean" ? obj.complet : computeChecklistComplet(entries);
  return { entries, complet };
}

export function buildClientDocumentChecklistForProducts(
  produitCodes: string[],
  produits: ProduitDocument[],
  previous?: DossierDocumentChecklistPayload | null,
): DossierDocumentChecklistPayload {
  const template = mergeProductChecklistTemplates(produitCodes, produits);
  if (!template.length) return { entries: [], complet: true };
  return buildChecklistFromTemplate(template, previous?.entries ?? null);
}

function checklistToPrismaJson(checklist: DossierDocumentChecklistPayload | null | undefined) {
  return (checklist ?? null) as unknown as import("@prisma/client").Prisma.InputJsonValue;
}

export async function findClientByAgenceAndCode(agenceId: string, code: string) {
  return prisma.lonaciClient.findFirst({
    where: { agenceId, code },
  });
}

export function buildClientListWhere(params: {
  q?: string;
  statut?: ClientStatut;
  categorie?: ClientCategorie;
  /** Filtre les clients autorisés pour ce code produit. */
  produitCode?: string;
  /** Clients sans aucun produit rattaché (imports non catégorisés). */
  sansProduit?: boolean;
  /** Clients sans agence renseignée. */
  sansAgence?: boolean;
  /** Clients éligibles caution : dossier en cours ou actif (exclut inactifs). */
  eligibleForCaution?: boolean;
  /** Clients éligibles contrat : dossier en cours ou actif. */
  eligibleForContrat?: boolean;
  /** Clients éligibles promotion PDV (parcours terminé, statut ACTIF). */
  eligibleForPromotion?: boolean;
  /** Clients déjà promus en PDV (lien sourceLonaciClientId). */
  linkedToConcessionnaire?: boolean;
  agenceId?: string;
  readerScope: Prisma.LonaciClientWhereInput;
  includeDeleted: boolean;
}): Prisma.LonaciClientWhereInput {
  const parts: Prisma.LonaciClientWhereInput[] = [];

  if (Object.keys(params.readerScope).length > 0) {
    parts.push(params.readerScope);
  }

  if (!params.includeDeleted) {
    parts.push(lonaciClientNotDeletedWhere);
  }

  if (params.sansAgence) {
    parts.push({ OR: [{ agenceId: null }, { agenceId: "" }] });
  } else if (params.agenceId) {
    parts.push({ agenceId: params.agenceId });
  }

  if (params.eligibleForPromotion) {
    parts.push({ statut: "ACTIF" });
  } else if (params.eligibleForCaution || params.eligibleForContrat) {
    parts.push({ statut: { in: ["DOSSIER_EN_COURS", "ACTIF"] } });
  } else if (params.statut) {
    parts.push({ statut: params.statut });
  }

  if (params.categorie) {
    parts.push({ categorie: params.categorie });
  }

  if (params.sansProduit) {
    parts.push({ produitsAutorises: { equals: [] } });
  } else if (params.produitCode?.trim()) {
    parts.push({ produitsAutorises: { has: params.produitCode.trim().toUpperCase() } });
  }

  if (params.q && params.q.trim().length > 0) {
    const q = params.q.trim();
    parts.push({
      OR: [
        { raisonSociale: { contains: q, mode: "insensitive" } },
        { nomComplet: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { codeMachine: { contains: q, mode: "insensitive" } },
        { cniNumero: { contains: q, mode: "insensitive" } },
        { nomContact: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { telephone: { contains: q, mode: "insensitive" } },
        { numeroDistributeur: { contains: q, mode: "insensitive" } },
        { numeroTpm: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}

export async function findLonaciClientById(id: string) {
  if (!isObjectId(id)) return null;
  return prisma.lonaciClient.findFirst({
    where: { AND: [{ id }, lonaciClientNotDeletedWhere] },
  });
}

export async function searchClients(params: {
  page: number;
  pageSize: number;
  q?: string;
  statut?: ClientStatut;
  categorie?: ClientCategorie;
  produitCode?: string;
  sansProduit?: boolean;
  sansAgence?: boolean;
  eligibleForCaution?: boolean;
  eligibleForContrat?: boolean;
  eligibleForPromotion?: boolean;
  linkedToConcessionnaire?: boolean;
  agenceId?: string;
  readerScope: Prisma.LonaciClientWhereInput;
  includeDeleted: boolean;
}) {
  await promoteClientsAwaitingN1ToDossierEnCours();

  const where = buildClientListWhere({
    q: params.q,
    statut: params.statut,
    categorie: params.categorie,
    produitCode: params.produitCode,
    sansProduit: params.sansProduit,
    sansAgence: params.sansAgence,
    eligibleForCaution: params.eligibleForCaution,
    eligibleForContrat: params.eligibleForContrat,
    eligibleForPromotion: params.eligibleForPromotion,
    linkedToConcessionnaire: params.linkedToConcessionnaire,
    agenceId: params.agenceId,
    readerScope: params.readerScope,
    includeDeleted: params.includeDeleted,
  });

  let promotionExcludeIds: string[] | null = null;
  let linkedIncludeIds: string[] | null = null;
  if (params.eligibleForPromotion) {
    const promoted = await prisma.concessionnaire.findMany({
      where: { deletedAt: null, sourceLonaciClientId: { not: null } },
      select: { sourceLonaciClientId: true },
    });
    promotionExcludeIds = promoted
      .map((r) => r.sourceLonaciClientId?.trim())
      .filter((id): id is string => Boolean(id));
  }
  if (params.linkedToConcessionnaire) {
    const promoted = await prisma.concessionnaire.findMany({
      where: { deletedAt: null, sourceLonaciClientId: { not: null } },
      select: { sourceLonaciClientId: true },
    });
    linkedIncludeIds = promoted
      .map((r) => r.sourceLonaciClientId?.trim())
      .filter((id): id is string => Boolean(id));
  }

  let finalWhere: Prisma.LonaciClientWhereInput = where;
  if (promotionExcludeIds && promotionExcludeIds.length > 0) {
    finalWhere = { AND: [finalWhere, { id: { notIn: promotionExcludeIds } }] };
  }
  if (params.linkedToConcessionnaire) {
    finalWhere =
      linkedIncludeIds && linkedIncludeIds.length > 0
        ? { AND: [finalWhere, { id: { in: linkedIncludeIds } }] }
        : { AND: [finalWhere, { id: { in: ["__none__"] } }] };
  }

  const skip = (params.page - 1) * params.pageSize;
  const [total, rows] = await Promise.all([
    prisma.lonaciClient.count({ where: finalWhere }),
    prisma.lonaciClient.findMany({
      where: finalWhere,
      orderBy: { updatedAt: "desc" },
      skip,
      take: params.pageSize,
    }),
  ]);

  const db = await getDatabase();
  const agenceMap = await loadAgenceLibelleMap(
    db,
    rows.map((row) => row.agenceId),
  );

  return {
    total,
    page: params.page,
    pageSize: params.pageSize,
    items: rows.map((doc) => ({
      ...sanitizeClientListItem(doc),
      agenceInscriptionLabel: doc.agenceId
        ? formatAgenceLibelle(agenceMap.get(doc.agenceId), doc.agenceId)
        : "Sans agence",
    })),
  };
}

export function sanitizeClientListItem(doc: {
  id: string;
  code: string;
  categorie?: string | null;
  raisonSociale: string;
  nomComplet: string | null;
  codeMachine?: string | null;
  cniNumero: string | null;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  typeDistributeur?: string | null;
  nombreTpm?: number | null;
  numeroDistributeur?: string | null;
  numeroTpm?: string | null;
  agenceId: string | null;
  statut: string;
  produitsAutorises: string[];
  documentChecklist?: unknown;
  validationN1At: Date | null;
  validationN1ByUserId: string | null;
  rejetMotif: string | null;
  rejetAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: doc.id,
    code: doc.code,
    categorie: normalizeClientCategorie(doc.categorie),
    raisonSociale: doc.raisonSociale,
    nomComplet: doc.nomComplet,
    codeMachine: doc.codeMachine ?? null,
    cniNumero: doc.cniNumero,
    nomContact: doc.nomContact,
    email: doc.email,
    telephone: doc.telephone,
    typeDistributeur: doc.typeDistributeur ?? null,
    nombreTpm: doc.nombreTpm ?? null,
    numeroDistributeur: doc.numeroDistributeur ?? null,
    numeroTpm: doc.numeroTpm ?? null,
    agenceId: doc.agenceId,
    statut: doc.statut,
    produitsAutorises: doc.produitsAutorises ?? [],
    checklistComplet: parseClientDocumentChecklist(doc.documentChecklist)?.complet ?? null,
    ...clientValidationFieldsForSanitize(doc),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function sanitizeClientPublic(doc: {
  id: string;
  code: string;
  categorie?: string | null;
  raisonSociale: string;
  nomComplet: string | null;
  codeMachine?: string | null;
  cniNumero: string | null;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  typeDistributeur?: string | null;
  nombreTpm?: number | null;
  numeroDistributeur?: string | null;
  numeroTpm?: string | null;
  agenceId: string | null;
  statut: string;
  produitsAutorises: string[];
  documentChecklist: unknown;
  validationN1At: Date | null;
  validationN1ByUserId: string | null;
  rejetMotif: string | null;
  rejetAt: Date | null;
  notes: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: doc.id,
    code: doc.code,
    categorie: normalizeClientCategorie(doc.categorie),
    raisonSociale: doc.raisonSociale,
    nomComplet: doc.nomComplet,
    codeMachine: doc.codeMachine ?? null,
    cniNumero: doc.cniNumero,
    nomContact: doc.nomContact,
    email: doc.email,
    telephone: doc.telephone,
    adresse: doc.adresse,
    ville: doc.ville,
    codePostal: doc.codePostal,
    typeDistributeur: doc.typeDistributeur ?? null,
    nombreTpm: doc.nombreTpm ?? null,
    numeroDistributeur: doc.numeroDistributeur ?? null,
    numeroTpm: doc.numeroTpm ?? null,
    agenceId: doc.agenceId,
    statut: doc.statut,
    produitsAutorises: doc.produitsAutorises ?? [],
    documentChecklist: parseClientDocumentChecklist(doc.documentChecklist),
    ...clientValidationFieldsForSanitize(doc),
    notes: doc.notes,
    createdByUserId: doc.createdByUserId,
    updatedByUserId: doc.updatedByUserId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
  };
}

export async function findClientById(id: string) {
  if (!isObjectId(id)) return null;
  return prisma.lonaciClient.findFirst({ where: { id } });
}

export async function createClient(
  input: {
    code: string;
    agenceCode: string;
    categorie: ClientCategorie;
    nomComplet: string;
    raisonSociale: string;
    codeMachine?: string | null;
    cniNumero: string | null;
    nomContact: string | null;
    email: string | null;
    telephone: string | null;
    adresse: string | null;
    ville: string | null;
    codePostal: string | null;
    typeDistributeur?: string | null;
    nombreTpm?: number | null;
    numeroDistributeur?: string | null;
    numeroTpm?: string | null;
    agenceId: string | null;
    produitsAutorises?: string[];
    documentChecklist?: Array<{ itemId: string; statut: "FOURNI" | "MANQUANT" | "EN_ATTENTE" }>;
    notes: string | null;
  },
  actor: UserDocument,
) {
  const cniNumero = input.cniNumero?.trim() ?? "";
  if (cniNumero.length < 4) {
    throw new Error("CLIENT_IDENTIFIANT_REQUIS");
  }

  if (!input.agenceId?.trim()) {
    throw new Error("AGENCE_REQUIRED");
  }

  const code = normalizeClientCodeForAgence(input.code, input.agenceCode);
  const duplicate = await findClientByAgenceAndCode(input.agenceId, code);
  if (duplicate) {
    throw new Error("CLIENT_CODE_DEJA_UTILISE");
  }

  const now = new Date();
  const statut = initialClientStatutOnCreate();
  const produits = await listProduits();
  let documentChecklist = buildClientDocumentChecklistForProducts(
    input.produitsAutorises ?? [],
    produits,
    null,
  );
  if (input.documentChecklist?.length && documentChecklist.entries.length) {
    documentChecklist = patchDocumentChecklistStatuts(documentChecklist, input.documentChecklist);
  }

  const row = await prisma.lonaciClient.create({
    data: {
      code,
      categorie: input.categorie,
      raisonSociale: input.raisonSociale.trim(),
      nomComplet: input.nomComplet.trim(),
      codeMachine: input.codeMachine?.trim() || null,
      cniNumero,
      nomContact: input.nomContact?.trim() || null,
      email: input.email?.trim() || null,
      telephone: input.telephone?.trim() || null,
      adresse: input.adresse,
      ville: input.ville,
      codePostal: input.codePostal,
      typeDistributeur: normalizeClientTypeDistributeur(input.typeDistributeur),
      nombreTpm:
        typeof input.nombreTpm === "number" && Number.isFinite(input.nombreTpm)
          ? Math.max(0, Math.trunc(input.nombreTpm))
          : null,
      numeroDistributeur: input.numeroDistributeur?.trim() || null,
      numeroTpm: input.numeroTpm?.trim() || null,
      agenceId: input.agenceId,
      produitsAutorises: input.produitsAutorises ?? [],
      documentChecklist: checklistToPrismaJson(documentChecklist),
      statut,
      validationN1At: null,
      validationN1ByUserId: null,
      rejetMotif: null,
      rejetAt: null,
      notes: input.notes,
      createdByUserId: actor._id ?? "",
      updatedByUserId: actor._id ?? "",
      createdAt: now,
      updatedAt: now,
    },
  });

  await appendAuditLog({
    entityType: "CLIENT",
    entityId: row.id,
    action: "CREATE",
    userId: actor._id ?? "",
    details: { code: row.code, statut: row.statut },
  });

  return row;
}

/** Passe le client en ACTIF après paiement de la première caution (idempotent). */
export async function activateClientAfterCautionPaid(clientId: string, actor: UserDocument): Promise<void> {
  if (!isObjectId(clientId)) return;
  const existing = await findLonaciClientById(clientId);
  if (!existing || existing.statut !== "DOSSIER_EN_COURS") return;

  await prisma.lonaciClient.update({
    where: { id: clientId },
    data: {
      statut: "ACTIF",
      updatedByUserId: actor._id ?? "",
      updatedAt: new Date(),
    },
  });

  await appendAuditLog({
    entityType: "CLIENT",
    entityId: clientId,
    action: "CLIENT_ACTIVATE_AFTER_CAUTION",
    userId: actor._id ?? "",
    details: { from: "DOSSIER_EN_COURS", to: "ACTIF" },
  });
}

export async function updateClient(
  id: string,
  patch: {
    categorie?: ClientCategorie;
    nomComplet?: string;
    raisonSociale?: string;
    codeMachine?: string | null;
    cniNumero?: string | null;
    nomContact?: string | null;
    email?: string | null;
    telephone?: string | null;
    adresse?: string | null;
    ville?: string | null;
    codePostal?: string | null;
    typeDistributeur?: string | null;
    nombreTpm?: number | null;
    numeroDistributeur?: string | null;
    numeroTpm?: string | null;
    agenceId?: string | null;
    /** Réaffectation d’agence à l’import (recalc du code CLI-AGENCE-…). */
    code?: string;
    produitsAutorises?: string[];
    documentChecklist?: Array<{ itemId: string; statut: "FOURNI" | "MANQUANT" | "EN_ATTENTE" }>;
    statut?: ClientStatut;
    notes?: string | null;
  },
  actor: UserDocument,
) {
  if (!isObjectId(id)) return null;
  const existing = await prisma.lonaciClient.findFirst({
    where: { AND: [{ id }, lonaciClientNotDeletedWhere] },
  });
  if (!existing) return null;

  const data: Prisma.LonaciClientUpdateInput = {
    updatedAt: new Date(),
    updatedByUserId: actor._id ?? "",
  };

  let checklist = parseClientDocumentChecklist(existing.documentChecklist);
  const produits = await listProduits();

  if (patch.produitsAutorises !== undefined) {
    data.produitsAutorises = patch.produitsAutorises;
    checklist = buildClientDocumentChecklistForProducts(patch.produitsAutorises, produits, checklist);
  }

  if (patch.documentChecklist?.length) {
    if (!checklist) {
      const codes = patch.produitsAutorises ?? existing.produitsAutorises ?? [];
      checklist = buildClientDocumentChecklistForProducts(codes, produits, null);
    }
    if (checklist.entries.length) {
      checklist = patchDocumentChecklistStatuts(checklist, patch.documentChecklist);
    }
  }

  if (checklist) {
    data.documentChecklist = checklistToPrismaJson(checklist);
  }

  if (patch.categorie !== undefined) data.categorie = patch.categorie;
  if (patch.nomComplet !== undefined) data.nomComplet = patch.nomComplet.trim();
  if (patch.raisonSociale !== undefined) data.raisonSociale = patch.raisonSociale.trim();
  if (patch.codeMachine !== undefined) {
    data.codeMachine = patch.codeMachine?.trim() || null;
  }
  if (patch.cniNumero !== undefined) data.cniNumero = patch.cniNumero;
  if (patch.nomContact !== undefined) data.nomContact = patch.nomContact?.trim() || null;
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.telephone !== undefined) data.telephone = patch.telephone;
  if (patch.adresse !== undefined) data.adresse = patch.adresse;
  if (patch.ville !== undefined) data.ville = patch.ville;
  if (patch.codePostal !== undefined) data.codePostal = patch.codePostal;
  if (patch.typeDistributeur !== undefined) {
    data.typeDistributeur = normalizeClientTypeDistributeur(patch.typeDistributeur);
  }
  if (patch.nombreTpm !== undefined) {
    data.nombreTpm =
      typeof patch.nombreTpm === "number" && Number.isFinite(patch.nombreTpm)
        ? Math.max(0, Math.trunc(patch.nombreTpm))
        : null;
  }
  if (patch.numeroDistributeur !== undefined) {
    data.numeroDistributeur = patch.numeroDistributeur?.trim() || null;
  }
  if (patch.numeroTpm !== undefined) {
    data.numeroTpm = patch.numeroTpm?.trim() || null;
  }
  if (patch.agenceId !== undefined) data.agenceId = patch.agenceId;
  if (patch.code !== undefined) {
    const nextCode = patch.code.trim().toUpperCase();
    if (nextCode) data.code = nextCode;
  }
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.statut !== undefined && (CLIENT_STATUTS as readonly string[]).includes(patch.statut)) {
    if (actor.role !== "CHEF_SERVICE") {
      throw new Error("CLIENT_STATUT_CHANGE_FORBIDDEN");
    }
    data.statut = patch.statut;
  }

  const row = await prisma.lonaciClient.update({
    where: { id },
    data,
  });

  await appendAuditLog({
    entityType: "CLIENT",
    entityId: id,
    action: "UPDATE",
    userId: actor._id ?? "",
    details: { fields: Object.keys(patch) },
  });

  return row;
}

export async function softDeleteClient(id: string, actor: UserDocument): Promise<boolean> {
  if (!isObjectId(id)) return false;
  const now = new Date();
  const result = await prisma.lonaciClient.updateMany({
    where: { AND: [{ id }, lonaciClientNotDeletedWhere] },
    data: {
      statut: "INACTIF",
      deletedAt: now,
      updatedAt: now,
      updatedByUserId: actor._id ?? "",
    },
  });
  if (result.count === 0) return false;

  await appendAuditLog({
    entityType: "CLIENT",
    entityId: id,
    action: "DEACTIVATE",
    userId: actor._id ?? "",
    details: { statut: "INACTIF" },
  });

  return true;
}

/** Validation N1 (Chef de section) : EN_ATTENTE_N1 → DOSSIER_EN_COURS. */
export async function validateClientCreationN1(clientId: string, actor: UserDocument) {
  if (actor.role !== "CHEF_SECTION") throw new Error("ROLE_FORBIDDEN");
  if (!isObjectId(clientId)) throw new Error("CLIENT_NOT_FOUND");

  const existing = await findLonaciClientById(clientId);
  if (!existing) throw new Error("CLIENT_NOT_FOUND");
  if (existing.statut !== "EN_ATTENTE_N1") throw new Error("CLIENT_WRONG_STATUS");

  const now = new Date();
  const row = await prisma.lonaciClient.update({
    where: { id: clientId },
    data: {
      statut: "DOSSIER_EN_COURS",
      validationN1At: now,
      validationN1ByUserId: actor._id ?? "",
      rejetMotif: null,
      rejetAt: null,
      updatedAt: now,
      updatedByUserId: actor._id ?? "",
    },
  });

  await appendAuditLog({
    entityType: "CLIENT",
    entityId: clientId,
    action: "CLIENT_VALIDATE_N1",
    userId: actor._id ?? "",
    details: { from: "EN_ATTENTE_N1", to: "DOSSIER_EN_COURS" },
  });

  const label = row.nomComplet?.trim() || row.raisonSociale;
  await notifyRoleTargets(
    "AGENT",
    "Client validé (N1)",
    `Client ${row.code} (${label}) validé par ${userDisplayName(actor)} | dossier en cours — caution possible.`,
    { clientId: row.id, code: row.code },
  );

  return row;
}

/** Rejet N1 : EN_ATTENTE_N1 → REJETE. */
export async function rejectClientCreationN1(
  clientId: string,
  motif: string,
  actor: UserDocument,
) {
  if (actor.role !== "CHEF_SECTION") throw new Error("ROLE_FORBIDDEN");
  if (!isObjectId(clientId)) throw new Error("CLIENT_NOT_FOUND");

  const trimmedMotif = motif.trim();
  if (trimmedMotif.length < 3) throw new Error("CLIENT_REJET_MOTIF_REQUIS");

  const existing = await findLonaciClientById(clientId);
  if (!existing) throw new Error("CLIENT_NOT_FOUND");
  if (existing.statut !== "EN_ATTENTE_N1") throw new Error("CLIENT_WRONG_STATUS");

  const now = new Date();
  const row = await prisma.lonaciClient.update({
    where: { id: clientId },
    data: {
      statut: "REJETE",
      rejetMotif: trimmedMotif,
      rejetAt: now,
      updatedAt: now,
      updatedByUserId: actor._id ?? "",
    },
  });

  await appendAuditLog({
    entityType: "CLIENT",
    entityId: clientId,
    action: "CLIENT_REJECT_N1",
    userId: actor._id ?? "",
    details: { motif: trimmedMotif },
  });

  const label = row.nomComplet?.trim() || row.raisonSociale;
  await notifyRoleTargets(
    "AGENT",
    "Client rejeté (N1)",
    `Client ${row.code} (${label}) rejeté par ${userDisplayName(actor)} | motif : ${trimmedMotif}.`,
    { clientId: row.id, code: row.code },
  );

  return row;
}

/** Resoumission après rejet : REJETE → EN_ATTENTE_N1. */
export async function resubmitClientForValidation(clientId: string, actor: UserDocument) {
  if (!isObjectId(clientId)) throw new Error("CLIENT_NOT_FOUND");

  const existing = await findLonaciClientById(clientId);
  if (!existing) throw new Error("CLIENT_NOT_FOUND");
  if (existing.statut !== "REJETE") throw new Error("CLIENT_WRONG_STATUS");

  const now = new Date();
  const row = await prisma.lonaciClient.update({
    where: { id: clientId },
    data: {
      statut: "EN_ATTENTE_N1",
      rejetMotif: null,
      rejetAt: null,
      updatedAt: now,
      updatedByUserId: actor._id ?? "",
    },
  });

  await appendAuditLog({
    entityType: "CLIENT",
    entityId: clientId,
    action: "CLIENT_RESUBMIT",
    userId: actor._id ?? "",
    details: { from: "REJETE", to: "EN_ATTENTE_N1" },
  });

  const label = row.nomComplet?.trim() || row.raisonSociale;
  await notifyRoleTargets(
    "CHEF_SECTION",
    "Client resoumis (validation N1)",
    `Client ${row.code} (${label}) resoumis par ${userDisplayName(actor)} | validation Chef de section requise.`,
    { clientId: row.id, code: row.code, agenceId: row.agenceId },
  );

  return row;
}
