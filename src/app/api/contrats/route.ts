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
import {
  allAnnexesArchivesComplete,
  allContratsArchivesComplete,
  contratProduitSummaryFromPayload,
  parseContratsGeneresPayload,
  summarizeContratsParProduit,
} from "@/lib/lonaci/contrat-document";
import { findAssociatedCautionForDossier } from "@/lib/lonaci/dossier-decharge-provisoire";
import { dossierEligibleDechargeDefinitive } from "@/lib/lonaci/dossier-decharge-constants";
import { parseDocumentChecklistPayload } from "@/lib/lonaci/produit-document-checklist";
import { submitAndAutoValidateContratDossier } from "@/lib/lonaci/dossier-contrat-auto-validate";
import {
  createDossier,
  ensureDossierIndexes,
  findDossierById,
  listVisibleDossierIds,
} from "@/lib/lonaci/dossiers";
import {
  extendContratDossierWithProduits,
  findEditableContratDossierForParty,
  getDossierProduitCodes,
  resolveDossierCautionsStatus,
  ensureChecklistForDossierProduits,
  serializeDossierProduitPayload,
} from "@/lib/lonaci/dossier-produits";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import { canReadClient } from "@/lib/lonaci/access";
import { isClientStatutEligibleForContrat } from "@/lib/lonaci/client-constants";
import { BANCARISATION_STATUTS } from "@/lib/lonaci/constants";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/guards";
import { buildWorkflowVisibilityMongoFilter } from "@/lib/auth/workflow-visibility";
import { formatAgenceLibelle, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";

const checklistItemSchema = z.object({
  itemId: z.string().min(1),
  statut: z.enum(["FOURNI", "MANQUANT", "EN_ATTENTE"]),
});

const gpsSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
});

const createSchema = z
  .object({
    concessionnaireId: z.string().min(1).optional(),
    lonaciClientId: z.string().min(1).optional(),
    agenceId: z.string().min(1),
    produitCode: z.string().min(1).optional(),
    produitCodes: z.array(z.string().min(1)).optional(),
    operationType: z.enum(["NOUVEAU", "ACTUALISATION"]),
    /** ISO 8601 (ex. toISOString()) — le client peut envoyer des dates avec offset ou Z. */
    dateOperation: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "dateOperation invalide" }),
    parentContratId: z.string().min(1).nullish(),
    /** null autorisé (formulaire envoie null si vide) — z.string().optional() seul rejetait null → 400. */
    observations: z.string().max(5000).nullish(),
    documentChecklist: z.array(checklistItemSchema).optional(),
    gps: gpsSchema.nullish(),
    commune: z.string().max(200).nullish(),
    quartier: z.string().max(200).nullish(),
    statutBancarisation: z.enum(BANCARISATION_STATUTS).optional(),
    compteBancaire: z.string().max(128).nullish(),
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
    const fromArray = (data.produitCodes ?? [])
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    const produitCodes = fromArray.length
      ? [...new Set(fromArray)]
      : data.produitCode?.trim()
        ? [data.produitCode.trim().toUpperCase()]
        : [];
    if (!produitCodes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Au moins un produit est requis.",
        path: ["produitCode"],
      });
    }
    if (data.operationType === "ACTUALISATION" && produitCodes.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Une actualisation ne porte que sur un seul produit à la fois.",
        path: ["produitCodes"],
      });
    }
    const compte = (data.compteBancaire ?? "").trim();
    if (data.statutBancarisation === "BANCARISE" && !compte) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le numéro de compte est obligatoire pour le statut BANCARISÉ.",
        path: ["compteBancaire"],
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

  const dossierIdsAllowlist = await listVisibleDossierIds(
    auth.user,
    agenceRestriction,
    "CONTRAT_ACTUALISATION",
    parsed.data.dossierStatus,
  );

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
          select: {
            id: true,
            code: true,
            categorie: true,
            nomComplet: true,
            raisonSociale: true,
            codeMachine: true,
            cniNumero: true,
            nomContact: true,
            email: true,
            telephone: true,
            adresse: true,
            ville: true,
            codePostal: true,
            typeDistributeur: true,
            nombreTpm: true,
            numeroDistributeur: true,
            numeroTpm: true,
            notes: true,
            produitsAutorises: true,
            agenceId: true,
            statut: true,
          },
        }),
  ]);
  const pdvMap = new Map(pdvRows.map((p) => [p.id, p]));
  const clientMap = new Map(clientRows.map((c) => [c.id, c]));
  const clientAgenceIds = clientRows.map((c) => c.agenceId);
  const agenceLabelMap = await loadAgenceLibelleMap(db, clientAgenceIds);

  const itemsWithPdv = result.items.map((c) => {
    const client = c.lonaciClientId ? clientMap.get(c.lonaciClientId) : undefined;
    if (client) {
      const agenceLabel = formatAgenceLibelle(
        client.agenceId ? agenceLabelMap.get(client.agenceId) : undefined,
        client.agenceId,
      );
      return {
        ...c,
        codePdv: client.code ?? "",
        nomPdv: client.nomComplet || client.raisonSociale || "",
        clientFiche: {
          code: client.code,
          categorie: client.categorie,
          nomComplet: client.nomComplet,
          raisonSociale: client.raisonSociale,
          codeMachine: client.codeMachine,
          cniNumero: client.cniNumero,
          nomContact: client.nomContact,
          email: client.email,
          telephone: client.telephone,
          adresse: client.adresse,
          ville: client.ville,
          codePostal: client.codePostal,
          typeDistributeur: client.typeDistributeur,
          nombreTpm: client.nombreTpm,
          numeroDistributeur: client.numeroDistributeur,
          numeroTpm: client.numeroTpm,
          notes: client.notes,
          produitsAutorises: client.produitsAutorises ?? [],
          agenceId: client.agenceId,
          agenceLabel,
          statut: client.statut,
        },
      };
    }
    const pdv = c.concessionnaireId ? pdvMap.get(c.concessionnaireId) : undefined;
    return {
      ...c,
      codePdv: pdv?.codePdv ?? "",
      nomPdv: pdv ? pdv.nomComplet || pdv.raisonSociale : "",
      clientFiche: null,
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
      const contratsGeneres = parseContratsGeneresPayload(meta?.payload ?? {});
      const produitSummary = contratProduitSummaryFromPayload(meta?.payload ?? {}, c.produitCode);
      return {
        ...c,
        dateDepot: depot.toISOString(),
        dossierEtape: dossierStatus,
        hasDocumentChecklist,
        checklistComplet: hasDocumentChecklist ? checklist!.complet : null,
        cautionPaid,
        cautionPaymentReference,
        dechargeDefinitiveEligible,
        hasContratGenere: contratsGeneres.length > 0,
        contratArchive: produitSummary?.contratArchive ?? allContratsArchivesComplete(meta?.payload ?? {}),
        annexeArchive: produitSummary?.annexeArchive ?? allAnnexesArchivesComplete(meta?.payload ?? {}),
        annexeReference: c.annexeReference ?? produitSummary?.referenceAnnexePreview ?? null,
        documentsAnnexeAttendus: produitSummary?.documentsAnnexeAttendus ?? [],
        contratsParProduit: summarizeContratsParProduit(meta?.payload ?? {}),
        ...contratStatutMetierFields(statutMetier),
      };
    }),
  );
  const dossierVisibility = buildWorkflowVisibilityMongoFilter({
    workflow: "DOSSIERS",
    role: auth.user.role,
    userId: auth.user._id ?? "",
  });
  const dossierFilterConditions: Record<string, unknown>[] = [
    { deletedAt: null },
    { type: "CONTRAT_ACTUALISATION" },
    dossierVisibility ?? { _id: { $in: [] } },
  ];
  if (mongoAgenceFilter) dossierFilterConditions.push({ agenceId: mongoAgenceFilter });
  if (parsed.data.concessionnaireId) {
    dossierFilterConditions.push({ concessionnaireId: parsed.data.concessionnaireId });
  }
  if (parsed.data.lonaciClientId) {
    dossierFilterConditions.push({ lonaciClientId: parsed.data.lonaciClientId });
  }
  if (parsed.data.dossierStatus) {
    dossierFilterConditions.push({ status: parsed.data.dossierStatus });
  }
  if (parsed.data.produitCode) {
    const pcode = parsed.data.produitCode.trim().toUpperCase();
    dossierFilterConditions.push({
      $or: [{ "payload.produitCode": pcode }, { "payload.produitCodes": pcode }],
    });
  }
  if (parsed.data.q?.trim()) {
    dossierFilterConditions.push({
      reference: { $regex: parsed.data.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
    });
  }

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
    dossierFilterConditions.push({ "payload.dateOperation": range });
  }

  const dossierFilter: Record<string, unknown> = { $and: dossierFilterConditions };

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

  /** File « à finaliser » (signature) : hors filtre mois — périmètre agence + visibilité. */
  const toSignFilterConditions: Record<string, unknown>[] = [
    { deletedAt: null },
    { type: "CONTRAT_ACTUALISATION" },
    { status: "VALIDE_N2" },
    dossierVisibility ?? { _id: { $in: [] } },
  ];
  if (mongoAgenceFilter) {
    toSignFilterConditions.push({ agenceId: mongoAgenceFilter });
  }
  if (parsed.data.concessionnaireId?.trim()) {
    toSignFilterConditions.push({ concessionnaireId: parsed.data.concessionnaireId.trim() });
  }
  const toSignFilter: Record<string, unknown> = { $and: toSignFilterConditions };
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

  const toSign = toSignDocs.map((d) => {
    const produitCodes = getDossierProduitCodes(d.payload ?? {});
    return {
      dossierId: d._id.toHexString(),
      reference: d.reference,
      concessionnaireId: d.concessionnaireId,
      produitCode: produitCodes[0] ?? String(d.payload.produitCode ?? ""),
      produitCodes,
      dateOperation: String(d.payload.dateOperation ?? ""),
      updatedAt: d.updatedAt.toISOString(),
    };
  });

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

  const dossiersEnriched = await Promise.all(
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
      const contratsGeneres = parseContratsGeneresPayload(d.payload ?? {});
      return {
        id,
        reference: d.reference,
        status: d.status,
        concessionnaireId: d.concessionnaireId,
        lonaciClientId: d.lonaciClientId ?? null,
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
        hasContratGenere: contratsGeneres.length > 0,
        contratArchive: allContratsArchivesComplete(d.payload ?? {}),
        annexeArchive: allAnnexesArchivesComplete(d.payload ?? {}),
        contratsParProduit: summarizeContratsParProduit(d.payload ?? {}),
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
  );

  /** Dossiers en cours (pas encore de ligne Prisma Contrat) → lignes du registre. */
  let itemsForRegistre = itemsEnriched;
  let totalForRegistre = result.total;
  if (!parsed.data.status) {
    const coveredDossierIds = new Set(itemsEnriched.map((c) => c.dossierId).filter(Boolean));
    const pendingDossiers = dossiersEnriched.filter(
      (d) => d.status !== "FINALISE" || !coveredDossierIds.has(d.id),
    );

    const extraPdvIds = [
      ...new Set(
        pendingDossiers
          .map((d) => d.concessionnaireId)
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0 && !pdvMap.has(id)),
      ),
    ];
    const extraClientIds = [
      ...new Set(
        pendingDossiers
          .map((d) => d.lonaciClientId)
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0 && !clientMap.has(id)),
      ),
    ];
    if (extraPdvIds.length > 0 || extraClientIds.length > 0) {
      const [extraPdv, extraClients] = await Promise.all([
        extraPdvIds.length === 0
          ? Promise.resolve([])
          : prisma.concessionnaire.findMany({
              where: { id: { in: extraPdvIds }, deletedAt: null },
              select: { id: true, codePdv: true, nomComplet: true, raisonSociale: true },
            }),
        extraClientIds.length === 0
          ? Promise.resolve([])
          : prisma.lonaciClient.findMany({
              where: { id: { in: extraClientIds }, deletedAt: null },
              select: {
                id: true,
                code: true,
                categorie: true,
                nomComplet: true,
                raisonSociale: true,
                codeMachine: true,
                cniNumero: true,
                nomContact: true,
                email: true,
                telephone: true,
                adresse: true,
                ville: true,
                codePostal: true,
                typeDistributeur: true,
                nombreTpm: true,
                numeroDistributeur: true,
                numeroTpm: true,
                notes: true,
                produitsAutorises: true,
                agenceId: true,
                statut: true,
              },
            }),
      ]);
      for (const p of extraPdv) pdvMap.set(p.id, p);
      for (const c of extraClients) clientMap.set(c.id, c);
      if (extraClients.length > 0) {
        const extraAgenceMap = await loadAgenceLibelleMap(
          db,
          extraClients.map((c) => c.agenceId),
        );
        for (const [id, doc] of extraAgenceMap) {
          agenceLabelMap.set(id, doc);
        }
      }
    }

    const syntheticItems = pendingDossiers.flatMap((d) => {
      const codes =
        d.produitCodes.length > 0
          ? d.produitCodes
          : (() => {
              const single = String(d.payload?.produitCode ?? "")
                .trim()
                .toUpperCase();
              return single ? [single] : ["—"];
            })();
      const operationType = String(d.payload?.operationType ?? "NOUVEAU");
      const dateEffetRaw = String(d.payload?.dateEffet ?? d.payload?.dateOperation ?? d.createdAt);
      const client = d.lonaciClientId ? clientMap.get(d.lonaciClientId) : undefined;
      const pdv = d.concessionnaireId ? pdvMap.get(d.concessionnaireId) : undefined;
      return codes
        .filter((code) => {
          if (!parsed.data.produitCode?.trim()) return true;
          return code === parsed.data.produitCode.trim().toUpperCase();
        })
        .map((produitCode) => {
          const produitSummary = contratProduitSummaryFromPayload(d.payload ?? {}, produitCode);
          const agenceLabel = client
            ? formatAgenceLibelle(
                client.agenceId ? agenceLabelMap.get(client.agenceId) : undefined,
                client.agenceId,
              )
            : "";
          return {
            id: `dossier:${d.id}:${produitCode}`,
            reference: d.reference,
            annexeReference: produitSummary?.referenceAnnexePreview ?? null,
            concessionnaireId: d.concessionnaireId ?? "",
            lonaciClientId: d.lonaciClientId,
            produitCode,
            operationType,
            status: d.status === "FINALISE" ? "ACTIF" : "BROUILLON",
            dateEffet: dateEffetRaw,
            dossierId: d.id,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            dateDepot: d.createdAt,
            dossierEtape: d.status,
            codePdv: client?.code ?? pdv?.codePdv ?? "",
            nomPdv: client
              ? client.nomComplet || client.raisonSociale || ""
              : pdv
                ? pdv.nomComplet || pdv.raisonSociale
                : "",
            clientFiche: client
              ? {
                  code: client.code,
                  categorie: client.categorie,
                  nomComplet: client.nomComplet,
                  raisonSociale: client.raisonSociale,
                  codeMachine: client.codeMachine,
                  cniNumero: client.cniNumero,
                  nomContact: client.nomContact,
                  email: client.email,
                  telephone: client.telephone,
                  adresse: client.adresse,
                  ville: client.ville,
                  codePostal: client.codePostal,
                  typeDistributeur: client.typeDistributeur,
                  nombreTpm: client.nombreTpm,
                  numeroDistributeur: client.numeroDistributeur,
                  numeroTpm: client.numeroTpm,
                  notes: client.notes,
                  produitsAutorises: client.produitsAutorises ?? [],
                  agenceId: client.agenceId,
                  agenceLabel,
                  statut: client.statut,
                }
              : null,
            hasDocumentChecklist: d.hasDocumentChecklist,
            checklistComplet: d.checklistComplet,
            cautionPaid: d.cautionPaid,
            cautionPaymentReference: d.cautionPaymentReference,
            dechargeDefinitiveEligible: d.dechargeDefinitiveEligible,
            hasContratGenere: d.hasContratGenere,
            contratArchive: produitSummary?.contratArchive ?? d.contratArchive,
            annexeArchive: produitSummary?.annexeArchive ?? d.annexeArchive,
            documentsAnnexeAttendus: produitSummary?.documentsAnnexeAttendus ?? [],
            contratsParProduit: d.contratsParProduit,
            ...contratStatutMetierFields(d.statutMetier),
            isDossierPending: true as const,
          };
        });
    });

    if (parsed.data.page === 1) {
      itemsForRegistre = [...syntheticItems, ...itemsEnriched];
    }
    totalForRegistre = result.total + syntheticItems.length;
  }

  return NextResponse.json(
    {
      ...result,
      total: totalForRegistre,
      items: itemsForRegistre,
      dossiers: dossiersEnriched,
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

  const fromArray = (parsed.data.produitCodes ?? [])
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  const produitCodes = fromArray.length
    ? [...new Set(fromArray)]
    : parsed.data.produitCode?.trim()
      ? [parsed.data.produitCode.trim().toUpperCase()]
      : [];

  if (parsed.data.operationType === "NOUVEAU") {
    for (const pcode of produitCodes) {
      const hasActive = await hasActiveContractForParty(party, pcode);
      if (hasActive) {
        return conflict(
          `Un contrat actif existe deja pour le produit ${pcode} et ce client.`,
          "ACTIVE_CONTRACT_EXISTS",
        );
      }
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

  for (const pcode of produitCodes) {
    if (!produitAutorisePourConcessionnaire(produitsAutorises, pcode)) {
      return badRequest(`Produit non autorise pour ce client : ${pcode}.`, "PRODUIT_NOT_ALLOWED");
    }
  }

  const gps = parsed.data.gps ?? null;
  const commune = (parsed.data.commune ?? "").trim() || null;
  const quartier = (parsed.data.quartier ?? "").trim() || null;
  const statutBancarisation = parsed.data.statutBancarisation ?? "NON_BANCARISE";
  const compteBancaire = (parsed.data.compteBancaire ?? "").trim() || null;
  const pdvMeta = {
    gps,
    commune,
    quartier,
    statutBancarisation,
    compteBancaire,
  };

  await ensureDossierIndexes();
  try {
    let resultDossier: Awaited<ReturnType<typeof createDossier>> | null = null;
    let extended = false;
    let added = false;

    if (parsed.data.operationType === "NOUVEAU") {
      const editable = await findEditableContratDossierForParty(party);
      if (editable?._id) {
        const existingCodes = getDossierProduitCodes(editable.payload ?? {});
        const missing = produitCodes.filter((code) => !existingCodes.includes(code));
        if (missing.length > 0) {
          const extension = await extendContratDossierWithProduits({
            dossierId: editable._id,
            produitCodes: missing,
            actor: auth.user,
            documentChecklist: parsed.data.documentChecklist,
          });
          resultDossier = extension.dossier;
          extended = true;
          added = extension.added.length > 0;
        } else {
          resultDossier = editable;
          extended = true;
          added = false;
        }
      }
    }

    if (!resultDossier) {
      resultDossier = await createDossier({
        type: "CONTRAT_ACTUALISATION",
        concessionnaireId,
        lonaciClientId,
        payload: {
          ...serializeDossierProduitPayload(produitCodes),
          operationType: parsed.data.operationType,
          dateOperation: parsed.data.dateOperation,
          dateEffet: parsed.data.dateOperation,
          agenceId: parsed.data.agenceId,
          parentContratId: parsed.data.parentContratId ?? null,
          observations: parsed.data.observations ?? null,
          ...pdvMeta,
        },
        documentChecklist: parsed.data.documentChecklist,
        actor: auth.user,
      });
    } else if (resultDossier._id) {
      const db = await getDatabase();
      const nextPayload = {
        ...(resultDossier.payload ?? {}),
        ...pdvMeta,
      };
      await db.collection("dossiers").updateOne(
        { _id: new ObjectId(resultDossier._id), deletedAt: null },
        {
          $set: {
            payload: nextPayload,
            updatedAt: new Date(),
            updatedByUserId: auth.user._id ?? "",
          },
        },
      );
      const refreshed = await findDossierById(resultDossier._id);
      if (refreshed) {
        resultDossier = refreshed;
      } else {
        resultDossier = { ...resultDossier, payload: nextPayload };
      }
    }

    const checklist = parseDocumentChecklistPayload(resultDossier.payload ?? {});
    let submitted = false;
    let autoValidated = false;
    let finalized = false;
    if (checklist?.complet) {
      const advanced = await submitAndAutoValidateContratDossier({
        dossier: resultDossier,
        actor: auth.user,
        submitComment: extended
          ? "Soumis après enrichissement du dossier existant."
          : "Soumis à la création après constitution de la checklist.",
      });
      resultDossier = advanced.dossier;
      submitted = advanced.submitted;
      autoValidated = advanced.autoValidated;
      finalized = advanced.finalized;
    }
    return NextResponse.json(
      {
        dossier: resultDossier,
        checklistRequired: Boolean(checklist?.entries.length),
        submitted,
        autoValidated,
        finalized,
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
