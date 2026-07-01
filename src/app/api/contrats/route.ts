import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId } from "mongodb";

import { apiError, badRequest, conflict, forbidden, notFound } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { produitAutorisePourConcessionnaire } from "@/lib/lonaci/contrat-produits";
import { isStatutFicheGelee, resolveListAgenceFilter } from "@/lib/lonaci/access";
import { restrictionToMongoAgenceFilter, restrictionToPrismaAgenceWhere } from "@/lib/lonaci/list-agence-restriction";
import {
  findContratById,
  hasActiveContractForParty,
  listContrats,
} from "@/lib/lonaci/contracts";
import { contratMatchesParty, type ContratPartyRef } from "@/lib/lonaci/dossier-contrat-party";
import {
  contratStatutMetierFields,
  resolveContratStatutMetier,
} from "@/lib/lonaci/contrat-statut-metier";
import { parseContratGenerePayload } from "@/lib/lonaci/contrat-document";
import { findAssociatedCautionForDossier } from "@/lib/lonaci/dossier-decharge-provisoire";
import { dossierEligibleDechargeDefinitive } from "@/lib/lonaci/dossier-decharge-constants";
import { parseDocumentChecklistPayload } from "@/lib/lonaci/produit-document-checklist";
import { createDossier, ensureDossierIndexes, transitionDossier } from "@/lib/lonaci/dossiers";
import {
  extendContratDossierWithProduit,
  findEditableContratDossierForParty,
  getDossierProduitCodes,
  resolveDossierCautionsStatus,
  ensureChecklistForDossierProduits,
} from "@/lib/lonaci/dossier-produits";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import { canReadClient } from "@/lib/lonaci/access";
import { isClientStatutEligibleForContrat } from "@/lib/lonaci/client-constants";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/guards";

const checklistItemSchema = z.object({
  itemId: z.string().min(1),
  statut: z.enum(["FOURNI", "MANQUANT", "EN_ATTENTE"]),
});

const createSchema = z
  .object({
    concessionnaireId: z.string().min(1).optional(),
    lonaciClientId: z.string().min(1).optional(),
    agenceId: z.string().min(1),
    produitCode: z.string().min(1),
    operationType: z.enum(["NOUVEAU", "ACTUALISATION"]),
    /** ISO 8601 (ex. toISOString()) — le client peut envoyer des dates avec offset ou Z. */
    dateOperation: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "dateOperation invalide" }),
    parentContratId: z.string().min(1).nullish(),
    /** null autorisé (formulaire envoie null si vide) — z.string().optional() seul rejetait null → 400. */
    observations: z.string().max(5000).nullish(),
    documentChecklist: z.array(checklistItemSchema).optional(),
  })
  .superRefine((data, ctx) => {
    const c = (data.concessionnaireId ?? "").trim();
    const l = (data.lonaciClientId ?? "").trim();
    if (!c && !l) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Client ou concessionnaire requis.",
        path: ["lonaciClientId"],
      });
    }
    if (c && l) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Preciser un seul rattachement : client ou concessionnaire.",
        path: ["lonaciClientId"],
      });
    }
  });

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  concessionnaireId: z.string().optional(),
  lonaciClientId: z.string().optional(),
  produitCode: z.string().optional(),
  /** Filtre liste contrats : ACTIF / RESILIE / CEDE */
  status: z.enum(["ACTIF", "RESILIE", "CEDE"]).optional(),
  /** Recherche dans la référence contrat */
  q: z.string().max(120).optional(),
  agenceId: z.string().optional(),
  dossierStatus: z.enum(["BROUILLON", "SOUMIS", "VALIDE_N1", "VALIDE_N2", "FINALISE", "REJETE"]).optional(),
  monthCurrent: z.coerce.boolean().optional().default(false),
  /** ISO ou date locale parsable (filtre date d’effet du contrat). */
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  const agenceScope = resolveListAgenceFilter(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) {
    return forbidden("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN");
  }
  const agenceRestriction = {
    agenceId: agenceScope.agenceId,
    agenceIds: agenceScope.agenceIds,
  };
  const agenceWhere = restrictionToPrismaAgenceWhere(agenceRestriction);
  const mongoAgenceFilter = restrictionToMongoAgenceFilter(agenceRestriction);
  const agenceIdForList =
    agenceRestriction.agenceIds && agenceRestriction.agenceIds.length > 1
      ? undefined
      : agenceRestriction.agenceId ?? agenceRestriction.agenceIds?.[0];
  let allowedConcessionnaireIds: string[] | null = null;
  let allowedLonaciClientIds: string[] | null = null;
  if (Object.keys(agenceWhere).length > 0) {
    const [scopedPdv, scopedClients] = await Promise.all([
      prisma.concessionnaire.findMany({
        where: { deletedAt: null, ...agenceWhere },
        select: { id: true },
      }),
      prisma.lonaciClient.findMany({
        where: { deletedAt: null, ...agenceWhere },
        select: { id: true },
      }),
    ]);
    allowedConcessionnaireIds = scopedPdv.map((c) => c.id);
    allowedLonaciClientIds = scopedClients.map((c) => c.id);
  }

  const db = await getDatabase();

  let dossierIdsAllowlist: string[] | null = null;
  if (parsed.data.dossierStatus) {
    const rows = await db
      .collection<{ _id: ObjectId }>("dossiers")
      .find({
        deletedAt: null,
        type: "CONTRAT_ACTUALISATION",
        status: parsed.data.dossierStatus,
      })
      .project({ _id: 1 })
      .limit(2000)
      .toArray();
    dossierIdsAllowlist = rows.map((r) => r._id.toHexString());
  }

  let dateEffetFrom: Date | undefined;
  let dateEffetTo: Date | undefined;
  if (parsed.data.monthCurrent) {
    const now = new Date();
    dateEffetFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    dateEffetTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else {
    if (parsed.data.dateFrom?.trim()) {
      const t = Date.parse(parsed.data.dateFrom.trim());
      if (!Number.isNaN(t)) dateEffetFrom = new Date(t);
    }
    if (parsed.data.dateTo?.trim()) {
      const t = Date.parse(parsed.data.dateTo.trim());
      if (!Number.isNaN(t)) dateEffetTo = new Date(t);
    }
  }

  const result = await listContrats({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    concessionnaireId: parsed.data.concessionnaireId,
    lonaciClientId: parsed.data.lonaciClientId,
    produitCode: parsed.data.produitCode,
    status: parsed.data.status,
    referenceContains: parsed.data.q,
    allowedConcessionnaireIds,
    allowedLonaciClientIds,
    agenceId: agenceIdForList,
    dateEffetFrom,
    dateEffetTo,
    dossierIdsAllowlist,
  });

  const pdvIds = [
    ...new Set(result.items.map((c) => c.concessionnaireId).filter((id): id is string => Boolean(id?.trim()))),
  ];
  const clientIds = [
    ...new Set(result.items.map((c) => c.lonaciClientId).filter((id): id is string => Boolean(id?.trim()))),
  ];
  const [pdvRows, clientRows] = await Promise.all([
    pdvIds.length === 0
      ? Promise.resolve([])
      : prisma.concessionnaire.findMany({
          where: { id: { in: pdvIds }, deletedAt: null },
          select: { id: true, codePdv: true, nomComplet: true, raisonSociale: true },
        }),
    clientIds.length === 0
      ? Promise.resolve([])
      : prisma.lonaciClient.findMany({
          where: { id: { in: clientIds }, deletedAt: null },
          select: { id: true, code: true, nomComplet: true, raisonSociale: true },
        }),
  ]);
  const pdvMap = new Map(pdvRows.map((p) => [p.id, p]));
  const clientMap = new Map(clientRows.map((c) => [c.id, c]));

  const itemsWithPdv = result.items.map((c) => {
    const client = c.lonaciClientId ? clientMap.get(c.lonaciClientId) : undefined;
    if (client) {
      return {
        ...c,
        codePdv: client.code ?? "",
        nomPdv: client.nomComplet || client.raisonSociale || "",
      };
    }
    const pdv = c.concessionnaireId ? pdvMap.get(c.concessionnaireId) : undefined;
    return {
      ...c,
      codePdv: pdv?.codePdv ?? "",
      nomPdv: pdv ? pdv.nomComplet || pdv.raisonSociale : "",
    };
  });

  const dossierHexIds = [
    ...new Set(
      itemsWithPdv.map((c) => c.dossierId).filter((id) => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id)),
    ),
  ];
  const dossierMetaById = new Map<
    string,
    { createdAt: Date; status: string; payload: Record<string, unknown> }
  >();
  if (dossierHexIds.length > 0) {
    const oids = dossierHexIds.map((id) => new ObjectId(id));
    const dossierDocs = await db
      .collection<{ _id: ObjectId; createdAt: Date; status: string; payload: Record<string, unknown> }>(
        "dossiers",
      )
      .find({ _id: { $in: oids } })
      .project({ createdAt: 1, status: 1, payload: 1 })
      .toArray();
    for (const d of dossierDocs) {
      dossierMetaById.set(d._id.toHexString(), {
        createdAt: d.createdAt,
        status: d.status,
        payload: d.payload ?? {},
      });
    }
  }

  const itemsEnriched = await Promise.all(
    itemsWithPdv.map(async (c) => {
      const meta = dossierMetaById.get(c.dossierId);
      const depot = meta?.createdAt ?? new Date(c.createdAt);
      const dossierStatus = meta?.status ?? "FINALISE";
      const checklist = parseDocumentChecklistPayload(meta?.payload ?? {});
      const hasDocumentChecklist = Boolean(checklist?.entries.length);
      let cautionPaid = false;
      let cautionPaymentReference: string | null = null;
      let dechargeDefinitiveEligible = false;
      if (meta && c.produitCode) {
        const parentContratId =
          typeof meta.payload.parentContratId === "string" ? meta.payload.parentContratId : null;
        const explicitCautionId =
          typeof meta.payload.cautionId === "string" ? meta.payload.cautionId : null;
        const caution = await findAssociatedCautionForDossier({
          concessionnaireId: c.concessionnaireId,
          lonaciClientId: c.lonaciClientId,
          produitCode: c.produitCode,
          parentContratId,
          explicitCautionId,
        });
        cautionPaid = caution?.status === "PAYEE";
        cautionPaymentReference =
          cautionPaid && caution?.paymentReference?.trim() ? caution.paymentReference.trim() : null;
        dechargeDefinitiveEligible = dossierEligibleDechargeDefinitive(
          hasDocumentChecklist ? checklist! : { entries: [], complet: false },
          cautionPaid,
          Boolean(cautionPaymentReference),
        );
      }
      const statutMetier = resolveContratStatutMetier({
        contratStatus: c.status,
        dossierStatus,
        checklistComplet: hasDocumentChecklist ? checklist!.complet : null,
        cautionPaid,
        hasDocumentChecklist,
      });
      const contratGenere = parseContratGenerePayload(meta?.payload ?? {});
      return {
        ...c,
        dateDepot: depot.toISOString(),
        dossierEtape: dossierStatus,
        hasDocumentChecklist,
        checklistComplet: hasDocumentChecklist ? checklist!.complet : null,
        cautionPaid,
        cautionPaymentReference,
        dechargeDefinitiveEligible,
        hasContratGenere: Boolean(contratGenere),
        contratArchive: Boolean(contratGenere?.contratSigneArchive),
        ...contratStatutMetierFields(statutMetier),
      };
    }),
  );
  const dossierFilter: Record<string, unknown> = {
    deletedAt: null,
    type: "CONTRAT_ACTUALISATION",
  };
  if (mongoAgenceFilter) dossierFilter.agenceId = mongoAgenceFilter;
  if (parsed.data.concessionnaireId) dossierFilter.concessionnaireId = parsed.data.concessionnaireId;
  if (parsed.data.produitCode) dossierFilter["payload.produitCode"] = parsed.data.produitCode.trim().toUpperCase();

  const range: Record<string, Date> = {};
  if (parsed.data.monthCurrent) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    range.$gte = from;
    range.$lt = to;
  } else {
    if (parsed.data.dateFrom) range.$gte = new Date(parsed.data.dateFrom);
    if (parsed.data.dateTo) range.$lte = new Date(parsed.data.dateTo);
  }
  if (Object.keys(range).length > 0) {
    dossierFilter["payload.dateOperation"] = range;
  }

  const dossiersRows = await db
    .collection<{
      _id: ObjectId;
      reference: string;
      type: string;
      status: string;
      concessionnaireId: string | null;
      lonaciClientId?: string | null;
      agenceId: string | null;
      payload: Record<string, unknown>;
      history: { status: string; actedByUserId: string; actedAt: Date; comment: string | null }[];
      createdAt: Date;
      updatedAt: Date;
    }>("dossiers")
    .find(dossierFilter)
    .sort({ updatedAt: -1 })
    .limit(300)
    .toArray();

  const pendingByLevel = {
    n1: dossiersRows.filter((d) => d.status === "SOUMIS").length,
    n2: dossiersRows.filter((d) => d.status === "VALIDE_N1").length,
    final: dossiersRows.filter((d) => d.status === "VALIDE_N2").length,
  };

  /** File « à finaliser » (signature) : hors filtre mois — périmètre agence respecté. */
  const toSignFilter: Record<string, unknown> = {
    deletedAt: null,
    type: "CONTRAT_ACTUALISATION",
    status: "VALIDE_N2",
  };
  if (mongoAgenceFilter) {
    toSignFilter.agenceId = mongoAgenceFilter;
  }
  if (parsed.data.concessionnaireId?.trim()) {
    toSignFilter.concessionnaireId = parsed.data.concessionnaireId.trim();
  }
  const toSignDocs = await db
    .collection<{
      _id: ObjectId;
      reference: string;
      concessionnaireId: string | null;
      lonaciClientId?: string | null;
      payload: Record<string, unknown>;
      updatedAt: Date;
    }>("dossiers")
    .find(toSignFilter)
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray();

  const toSign = toSignDocs.map((d) => ({
    dossierId: d._id.toHexString(),
    reference: d.reference,
    concessionnaireId: d.concessionnaireId,
    produitCode: String(d.payload.produitCode ?? ""),
    dateOperation: String(d.payload.dateOperation ?? ""),
    updatedAt: d.updatedAt.toISOString(),
  }));

  const finalisedDossiers = dossiersRows.filter((d) => d.status === "FINALISE");
  const totalsByProduct = new Map<
    string,
    { weekly: number; monthly: number }
  >();
  const startWeek = new Date();
  startWeek.setDate(startWeek.getDate() - 6);
  startWeek.setHours(0, 0, 0, 0);
  const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  for (const d of finalisedDossiers) {
    const product = String(d.payload.produitCode ?? "INCONNU");
    const opDate = new Date(String(d.payload.dateOperation ?? d.createdAt.toISOString()));
    const prev = totalsByProduct.get(product) ?? { weekly: 0, monthly: 0 };
    if (opDate >= startWeek) prev.weekly += 1;
    if (opDate >= startMonth) prev.monthly += 1;
    totalsByProduct.set(product, prev);
  }

  const totals = [...totalsByProduct.entries()].map(([produitCode, values]) => ({
    produitCode,
    weekly: values.weekly,
    monthly: values.monthly,
  }));

  return NextResponse.json(
    {
      ...result,
      items: itemsEnriched,
      dossiers: await Promise.all(
        dossiersRows.map(async (d) => {
          const id = d._id.toHexString();
          const mapped = {
            _id: id,
            type: d.type,
            status: d.status,
            concessionnaireId: d.concessionnaireId,
            lonaciClientId: d.lonaciClientId,
            payload: d.payload ?? {},
          };
          const produitCodes = getDossierProduitCodes(d.payload ?? {});
          const checklist = await ensureChecklistForDossierProduits(d.payload ?? {}, produitCodes);
          const hasDocumentChecklist = Boolean(checklist.entries.length);
          const cautionsStatus = await resolveDossierCautionsStatus(mapped);
          const cautionPaid = cautionsStatus.allPaid;
          const cautionPaymentReference = cautionsStatus.primaryPaymentReference;
          const dechargeDefinitiveEligible = dossierEligibleDechargeDefinitive(
            hasDocumentChecklist ? checklist : { entries: [], complet: false },
            cautionPaid,
            Boolean(cautionPaymentReference),
          );
          const statutMetier = resolveContratStatutMetier({
            dossierStatus: d.status,
            checklistComplet: hasDocumentChecklist ? checklist.complet : null,
            cautionPaid,
            hasDocumentChecklist,
          });
          return {
            id,
            reference: d.reference,
            status: d.status,
            concessionnaireId: d.concessionnaireId,
            agenceId: d.agenceId,
            payload: d.payload,
            hasDocumentChecklist,
            checklistComplet: hasDocumentChecklist ? checklist.complet : null,
            cautionPaid,
            cautionPaymentReference,
            produitCodes,
            cautionsByProduit: cautionsStatus.links.map((l) => ({
              produitCode: l.produitCode,
              cautionPaid: l.status === "PAYEE" && Boolean(l.paymentReference),
              paymentReference: l.paymentReference,
              referenceLabel: l.referenceLabel,
            })),
            dechargeDefinitiveEligible,
            ...contratStatutMetierFields(statutMetier),
            history: d.history.map((h) => ({
              status: h.status,
              actedByUserId: h.actedByUserId,
              actedAt: h.actedAt.toISOString(),
              comment: h.comment,
            })),
            createdAt: d.createdAt.toISOString(),
            updatedAt: d.updatedAt.toISOString(),
          };
        }),
      ),
      pendingByLevel,
      toSign,
      totalsByProduct: totals,
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const lonaciClientId = (parsed.data.lonaciClientId ?? "").trim() || null;
  const concessionnaireId = (parsed.data.concessionnaireId ?? "").trim() || null;
  const party: ContratPartyRef = lonaciClientId
    ? { kind: "client", lonaciClientId }
    : { kind: "concessionnaire", concessionnaireId: concessionnaireId! };

  if (parsed.data.operationType === "NOUVEAU") {
    const hasActive = await hasActiveContractForParty(party, parsed.data.produitCode.trim().toUpperCase());
    if (hasActive) {
      return conflict(
        "Un contrat actif existe deja pour ce produit et ce client.",
        "ACTIVE_CONTRACT_EXISTS",
      );
    }
  }
  if (parsed.data.operationType === "ACTUALISATION") {
    if (!parsed.data.parentContratId) {
      return badRequest(
        "Le contrat d'origine est obligatoire pour une actualisation.",
        "PARENT_CONTRAT_REQUIRED",
      );
    }
    const parent = await findContratById(parsed.data.parentContratId);
    if (!parent || parent.status !== "ACTIF" || !contratMatchesParty(parent, party)) {
      return notFound("Contrat d'origine introuvable ou inactif.", "PARENT_CONTRAT_NOT_FOUND");
    }
  }

  let produitsAutorises: string[] = [];
  if (party.kind === "client") {
    const client = await findLonaciClientById(party.lonaciClientId);
    if (!client) {
      return notFound("Client introuvable.", "CLIENT_NOT_FOUND");
    }
    if (!canReadClient(auth.user, client)) {
      return forbidden("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN");
    }
    if (!isClientStatutEligibleForContrat(client.statut)) {
      if (client.statut === "EN_ATTENTE_N1" || client.statut === "REJETE") {
        return conflict(
          "Validation N1 requise avant contrat.",
          "CLIENT_INSCRIPTION_PENDING",
        );
      }
      return conflict("Client bloque.", "CLIENT_BLOQUE");
    }
    if (!client.agenceId || client.agenceId !== parsed.data.agenceId) {
      return badRequest("Agence invalide pour ce client.", "AGENCE_INVALID");
    }
    produitsAutorises = client.produitsAutorises ?? [];
  } else {
    const concessionnaire = await findConcessionnaireById(party.concessionnaireId);
    if (!concessionnaire || concessionnaire.deletedAt) {
      return notFound("Concessionnaire introuvable.", "CONCESSIONNAIRE_NOT_FOUND");
    }
    if (isStatutFicheGelee(concessionnaire.statut)) {
      return conflict(
        "Operation interdite: concessionnaire résilié ou décédé.",
        "CONCESSIONNAIRE_BLOQUE",
      );
    }
    if (!concessionnaire.agenceId || concessionnaire.agenceId !== parsed.data.agenceId) {
      return badRequest("Agence invalide pour ce concessionnaire.", "AGENCE_INVALID");
    }
    produitsAutorises = concessionnaire.produitsAutorises ?? [];
  }

  const p = parsed.data.produitCode.trim().toUpperCase();
  if (!produitAutorisePourConcessionnaire(produitsAutorises, p)) {
    return badRequest("Produit non autorise pour ce client.", "PRODUIT_NOT_ALLOWED");
  }

  await ensureDossierIndexes();
  try {
    let resultDossier: Awaited<ReturnType<typeof createDossier>> | null = null;
    let extended = false;
    let added = false;

    if (parsed.data.operationType === "NOUVEAU") {
      const editable = await findEditableContratDossierForParty(party);
      if (editable?._id) {
        const extension = await extendContratDossierWithProduit({
          dossierId: editable._id,
          produitCode: p,
          actor: auth.user,
          documentChecklist: parsed.data.documentChecklist,
        });
        resultDossier = extension.dossier;
        extended = true;
        added = extension.added;
      }
    }

    if (!resultDossier) {
      resultDossier = await createDossier({
        type: "CONTRAT_ACTUALISATION",
        concessionnaireId,
        lonaciClientId,
        payload: {
          produitCode: p,
          operationType: parsed.data.operationType,
          dateOperation: parsed.data.dateOperation,
          dateEffet: parsed.data.dateOperation,
          agenceId: parsed.data.agenceId,
          parentContratId: parsed.data.parentContratId ?? null,
          observations: parsed.data.observations ?? null,
        },
        documentChecklist: parsed.data.documentChecklist,
        actor: auth.user,
      });
    }

    const checklist = parseDocumentChecklistPayload(resultDossier.payload ?? {});
    let submitted = false;
    if (checklist?.complet) {
      resultDossier = await transitionDossier(
        resultDossier._id ?? "",
        "SOUMIS",
        auth.user,
        extended
          ? "Soumis après enrichissement du dossier existant."
          : "Soumis à la création après constitution de la checklist.",
      );
      submitted = true;
    }
    return NextResponse.json(
      {
        dossier: resultDossier,
        checklistRequired: Boolean(checklist?.entries.length),
        submitted,
        extended,
        added,
      },
      { status: extended ? 200 : 201 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CONCESSIONNAIRE_BLOQUE") {
      return conflict("Concessionnaire bloque.", "CONCESSIONNAIRE_BLOQUE");
    }
    if (code === "CLIENT_INSCRIPTION_PENDING") {
      return conflict(
        "Validation N1 requise avant contrat.",
        "CLIENT_INSCRIPTION_PENDING",
      );
    }
    if (code === "CLIENT_BLOQUE" || code === "CLIENT_NOT_FOUND") {
      return conflict("Client bloque ou introuvable.", "CLIENT_BLOQUE");
    }
    if (code === "AGENCE_FORBIDDEN") {
      return forbidden("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN");
    }
    if (code === "PRODUIT_INVALID") {
      return badRequest("Produit invalide.", "PRODUIT_INVALID");
    }
    if (code === "ACTIVE_CONTRACT_EXISTS") {
      return conflict(
        "Un contrat actif existe deja pour ce produit et ce client.",
        "ACTIVE_CONTRACT_EXISTS",
      );
    }
    if (code === "PRODUIT_NOT_ALLOWED") {
      return badRequest("Produit non autorise pour ce client.", "PRODUIT_NOT_ALLOWED");
    }
    if (code === "AGENCE_INVALID") {
      return badRequest("Agence invalide.", "AGENCE_INVALID");
    }
    if (code === "CONCESSIONNAIRE_NOT_FOUND" || code === "PARTY_REQUIRED") {
      return badRequest("Client ou concessionnaire introuvable.", "PARTY_NOT_FOUND");
    }
    if (code === "DOSSIER_NOT_EDITABLE" || code === "DOSSIER_OPERATION_NOT_EXTENDABLE") {
      return conflict("Le dossier existant n'est pas enrichissable.", code);
    }
    if (code === "DOSSIER_CHECKLIST_INCOMPLETE") {
      return conflict(
        "Soumission impossible : la checklist documents du dossier est incomplète. Marquez tous les documents obligatoires comme « Fourni ».",
        "DOSSIER_CHECKLIST_INCOMPLETE",
      );
    }
    console.error("POST /api/contrats failed:", error);
    return apiError(500, "Creation dossier contrat impossible.", "CONTRAT_CREATE_FAILED");
  }
}
