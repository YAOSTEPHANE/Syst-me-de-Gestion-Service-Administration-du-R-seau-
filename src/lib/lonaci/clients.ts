import type { Prisma } from "@prisma/client";

import { appendAuditLog } from "@/lib/lonaci/audit";
import { CLIENT_CODE_PREFIX, CLIENT_STATUTS, type ClientStatut } from "@/lib/lonaci/client-constants";
import { prisma } from "@/lib/prisma";
import type { UserDocument } from "@/lib/lonaci/types";

const CLIENT_REF_COUNTER_ID = "client_ref";

/** Fiches client actives (non désactivées) : Prisma Mongo ne matche pas `null` si la clé `deletedAt` est absente. */
export const lonaciClientNotDeletedWhere: Prisma.LonaciClientWhereInput = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
};

function isObjectId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}

export async function allocateClientCode(): Promise<string> {
  const row = await prisma.counter.upsert({
    where: { id: CLIENT_REF_COUNTER_ID },
    create: { id: CLIENT_REF_COUNTER_ID, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  return `${CLIENT_CODE_PREFIX}-${String(row.seq).padStart(6, "0")}`;
}

export function buildClientListWhere(params: {
  q?: string;
  statut?: ClientStatut;
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

  if (params.agenceId) {
    parts.push({ agenceId: params.agenceId });
  }

  if (params.statut) {
    parts.push({ statut: params.statut });
  }

  if (params.q && params.q.trim().length > 0) {
    const q = params.q.trim();
    parts.push({
      OR: [
        { raisonSociale: { contains: q, mode: "insensitive" } },
        { nomComplet: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { cniNumero: { contains: q, mode: "insensitive" } },
        { nomContact: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { telephone: { contains: q, mode: "insensitive" } },
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
  agenceId?: string;
  readerScope: Prisma.LonaciClientWhereInput;
  includeDeleted: boolean;
}) {
  const where = buildClientListWhere({
    q: params.q,
    statut: params.statut,
    agenceId: params.agenceId,
    readerScope: params.readerScope,
    includeDeleted: params.includeDeleted,
  });

  let whereJson = "";
  try {
    whereJson = JSON.stringify(where).slice(0, 900);
  } catch {
    whereJson = "(unserializable)";
  }
  // #region agent log
  fetch("http://127.0.0.1:27772/ingest/4bb0b21c-00fd-438b-b24a-787fe0e18287", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "669066" },
    body: JSON.stringify({
      sessionId: "669066",
      hypothesisId: "H2",
      location: "lib/lonaci/clients.ts:searchClients",
      message: "searchClients prisma where",
      data: { whereJson },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const skip = (params.page - 1) * params.pageSize;
  const [total, rows] = await Promise.all([
    prisma.lonaciClient.count({ where }),
    prisma.lonaciClient.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take: params.pageSize,
    }),
  ]);

  // #region agent log
  fetch("http://127.0.0.1:27772/ingest/4bb0b21c-00fd-438b-b24a-787fe0e18287", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "669066" },
      body: JSON.stringify({
        sessionId: "669066",
        hypothesisId: "H2",
        runId: "post-fix",
        location: "lib/lonaci/clients.ts:searchClients",
        message: "searchClients prisma counts",
        data: { total, rowsReturned: rows.length },
        timestamp: Date.now(),
      }),
  }).catch(() => {});
  // #endregion

  return {
    total,
    page: params.page,
    pageSize: params.pageSize,
    items: rows.map(sanitizeClientListItem),
  };
}

export function sanitizeClientListItem(doc: {
  id: string;
  code: string;
  raisonSociale: string;
  nomComplet: string | null;
  cniNumero: string | null;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  agenceId: string | null;
  statut: string;
  updatedAt: Date;
}) {
  return {
    id: doc.id,
    code: doc.code,
    raisonSociale: doc.raisonSociale,
    nomComplet: doc.nomComplet,
    cniNumero: doc.cniNumero,
    nomContact: doc.nomContact,
    email: doc.email,
    telephone: doc.telephone,
    agenceId: doc.agenceId,
    statut: doc.statut,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function sanitizeClientPublic(doc: {
  id: string;
  code: string;
  raisonSociale: string;
  nomComplet: string | null;
  cniNumero: string | null;
  nomContact: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  agenceId: string | null;
  statut: string;
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
    raisonSociale: doc.raisonSociale,
    nomComplet: doc.nomComplet,
    cniNumero: doc.cniNumero,
    nomContact: doc.nomContact,
    email: doc.email,
    telephone: doc.telephone,
    adresse: doc.adresse,
    ville: doc.ville,
    codePostal: doc.codePostal,
    agenceId: doc.agenceId,
    statut: doc.statut,
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
    nomComplet: string;
    raisonSociale: string;
    cniNumero: string | null;
    nomContact: string | null;
    email: string | null;
    telephone: string | null;
    adresse: string | null;
    ville: string | null;
    codePostal: string | null;
    agenceId: string | null;
    statut?: ClientStatut;
    notes: string | null;
  },
  actor: UserDocument,
) {
  const now = new Date();
  const code = await allocateClientCode();
  const statut = input.statut && (CLIENT_STATUTS as readonly string[]).includes(input.statut) ? input.statut : "ACTIF";

  const row = await prisma.lonaciClient.create({
    data: {
      code,
      raisonSociale: input.raisonSociale.trim(),
      nomComplet: input.nomComplet.trim(),
      cniNumero: input.cniNumero,
      nomContact: input.nomContact,
      email: input.email,
      telephone: input.telephone,
      adresse: input.adresse,
      ville: input.ville,
      codePostal: input.codePostal,
      agenceId: input.agenceId,
      statut,
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
    details: { code: row.code },
  });

  return row;
}

export async function updateClient(
  id: string,
  patch: {
    nomComplet?: string;
    raisonSociale?: string;
    cniNumero?: string | null;
    nomContact?: string | null;
    email?: string | null;
    telephone?: string | null;
    adresse?: string | null;
    ville?: string | null;
    codePostal?: string | null;
    agenceId?: string | null;
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

  if (patch.nomComplet !== undefined) data.nomComplet = patch.nomComplet.trim();
  if (patch.raisonSociale !== undefined) data.raisonSociale = patch.raisonSociale.trim();
  if (patch.cniNumero !== undefined) data.cniNumero = patch.cniNumero;
  if (patch.nomContact !== undefined) data.nomContact = patch.nomContact;
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.telephone !== undefined) data.telephone = patch.telephone;
  if (patch.adresse !== undefined) data.adresse = patch.adresse;
  if (patch.ville !== undefined) data.ville = patch.ville;
  if (patch.codePostal !== undefined) data.codePostal = patch.codePostal;
  if (patch.agenceId !== undefined) data.agenceId = patch.agenceId;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.statut !== undefined && (CLIENT_STATUTS as readonly string[]).includes(patch.statut)) {
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
