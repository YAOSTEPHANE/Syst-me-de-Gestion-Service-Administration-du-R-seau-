import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId } from "mongodb";

import { produitAutorisePourConcessionnaire } from "@/lib/lonaci/contrat-produits";
import { isStatutBloquant } from "@/lib/lonaci/access";
import {
  finalizeContratFromDossier,
  findContratById,
  hasActiveContractForProduct,
  listContrats,
} from "@/lib/lonaci/contracts";
import { createDossier, ensureDossierIndexes } from "@/lib/lonaci/dossiers";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { getDatabase } from "@/lib/mongodb";
import { prisma } from "@/lib/prisma";
import { requireApiAuth } from "@/lib/auth/guards";

const createSchema = z.object({
  concessionnaireId: z.string().min(1),
  agenceId: z.string().min(1),
  produitCode: z.string().min(1),
  operationType: z.enum(["NOUVEAU", "ACTUALISATION"]),
  /** ISO 8601 (ex. toISOString()) — le client peut envoyer des dates avec offset ou Z. */
  dateOperation: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: "dateOperation invalide" }),
  parentContratId: z.string().min(1).nullish(),
  /** null autorisé (formulaire envoie null si vide) — z.string().optional() seul rejetait null → 400. */
  observations: z.string().max(5000).nullish(),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  concessionnaireId: z.string().optional(),
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

/** Aligné sur l’export CSV contrats : vue nationale vs agence fixée. */
function listScopeAgenceId(user: { agenceId: string | null; role: string }): string | undefined {
  if (user.role === "CHEF_SERVICE" && user.agenceId === null) {
    return undefined;
  }
  if (user.agenceId) return user.agenceId;
  return undefined;
}

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
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const scopeAgenceId = listScopeAgenceId(auth.user);
  let allowedConcessionnaireIds: string[] | null = null;
  if (scopeAgenceId) {
    const scoped = await prisma.concessionnaire.findMany({
      where: { deletedAt: null, agenceId: scopeAgenceId },
      select: { id: true },
    });
    allowedConcessionnaireIds = scoped.map((c) => c.id);
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

  const agenceIdForList = scopeAgenceId ?? parsed.data.agenceId ?? undefined;

  const result = await listContrats({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    concessionnaireId: parsed.data.concessionnaireId,
    produitCode: parsed.data.produitCode,
    status: parsed.data.status,
    referenceContains: parsed.data.q,
    allowedConcessionnaireIds,
    agenceId: agenceIdForList,
    dateEffetFrom,
    dateEffetTo,
    dossierIdsAllowlist,
  });

  const pdvIds = [...new Set(result.items.map((c) => c.concessionnaireId))];
  const pdvRows =
    pdvIds.length === 0
      ? []
      : await prisma.concessionnaire.findMany({
          where: { id: { in: pdvIds }, deletedAt: null },
          select: { id: true, codePdv: true, nomComplet: true, raisonSociale: true },
        });
  const pdvMap = new Map(pdvRows.map((p) => [p.id, p]));

  const itemsWithPdv = result.items.map((c) => {
    const pdv = pdvMap.get(c.concessionnaireId);
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
  const dossierMetaById = new Map<string, { createdAt: Date; status: string }>();
  if (dossierHexIds.length > 0) {
    const oids = dossierHexIds.map((id) => new ObjectId(id));
    const dossierDocs = await db
      .collection<{ _id: ObjectId; createdAt: Date; status: string }>("dossiers")
      .find({ _id: { $in: oids } })
      .project({ createdAt: 1, status: 1 })
      .toArray();
    for (const d of dossierDocs) {
      dossierMetaById.set(d._id.toHexString(), { createdAt: d.createdAt, status: d.status });
    }
  }

  const itemsEnriched = itemsWithPdv.map((c) => {
    const meta = dossierMetaById.get(c.dossierId);
    const depot = meta?.createdAt ?? new Date(c.createdAt);
    return {
      ...c,
      dateDepot: depot.toISOString(),
      dossierEtape: meta?.status ?? "FINALISE",
    };
  });
  const dossierFilter: Record<string, unknown> = {
    deletedAt: null,
    type: "CONTRAT_ACTUALISATION",
  };
  if (parsed.data.agenceId) dossierFilter.agenceId = parsed.data.agenceId;
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
      status: string;
      concessionnaireId: string;
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
  if (scopeAgenceId) {
    toSignFilter.agenceId = scopeAgenceId;
  } else if (parsed.data.agenceId?.trim()) {
    toSignFilter.agenceId = parsed.data.agenceId.trim();
  }
  if (parsed.data.concessionnaireId?.trim()) {
    toSignFilter.concessionnaireId = parsed.data.concessionnaireId.trim();
  }
  const toSignDocs = await db
    .collection<{
      _id: ObjectId;
      reference: string;
      concessionnaireId: string;
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
      dossiers: dossiersRows.map((d) => ({
        id: d._id.toHexString(),
        reference: d.reference,
        status: d.status,
        concessionnaireId: d.concessionnaireId,
        agenceId: d.agenceId,
        payload: d.payload,
        history: d.history.map((h) => ({
          status: h.status,
          actedByUserId: h.actedByUserId,
          actedAt: h.actedAt.toISOString(),
          comment: h.comment,
        })),
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
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
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.operationType === "NOUVEAU") {
    const hasActive = await hasActiveContractForProduct(
      parsed.data.concessionnaireId,
      parsed.data.produitCode.trim().toUpperCase(),
    );
    if (hasActive) {
      return NextResponse.json(
        { message: "Un contrat actif existe deja pour ce produit et ce concessionnaire." },
        { status: 409 },
      );
    }
  }
  if (parsed.data.operationType === "ACTUALISATION") {
    if (!parsed.data.parentContratId) {
      return NextResponse.json(
        { message: "Le contrat d'origine est obligatoire pour une actualisation." },
        { status: 400 },
      );
    }
    const parent = await findContratById(parsed.data.parentContratId);
    if (!parent || parent.status !== "ACTIF") {
      return NextResponse.json({ message: "Contrat d'origine introuvable ou inactif." }, { status: 404 });
    }
  }
  const concessionnaire = await findConcessionnaireById(parsed.data.concessionnaireId);
  if (!concessionnaire || concessionnaire.deletedAt) {
    return NextResponse.json({ message: "Concessionnaire introuvable." }, { status: 404 });
  }
  if (isStatutBloquant(concessionnaire.statut)) {
    return NextResponse.json(
      { message: "Operation interdite: concessionnaire résilié / inactif / décédé." },
      { status: 409 },
    );
  }
  if (!concessionnaire.agenceId || concessionnaire.agenceId !== parsed.data.agenceId) {
    return NextResponse.json({ message: "Agence invalide pour ce concessionnaire." }, { status: 400 });
  }
  const p = parsed.data.produitCode.trim().toUpperCase();
  if (!produitAutorisePourConcessionnaire(concessionnaire.produitsAutorises ?? [], p)) {
    return NextResponse.json({ message: "Produit non autorise pour ce concessionnaire." }, { status: 400 });
  }

  await ensureDossierIndexes();
  try {
    const autoValidate = auth.user.role === "CHEF_SERVICE";
    const now = new Date();
    const dossier = await createDossier({
      type: "CONTRAT_ACTUALISATION",
      concessionnaireId: parsed.data.concessionnaireId,
      payload: {
        produitCode: parsed.data.produitCode.trim().toUpperCase(),
        operationType: parsed.data.operationType,
        dateOperation: parsed.data.dateOperation,
        dateEffet: parsed.data.dateOperation,
        agenceId: parsed.data.agenceId,
        parentContratId: parsed.data.parentContratId ?? null,
        observations: parsed.data.observations ?? null,
      },
      actor: auth.user,
      initialStatus: autoValidate ? "FINALISE" : undefined,
      initialHistory: autoValidate
        ? [
            {
              status: "FINALISE",
              actedByUserId: auth.user._id ?? "",
              actedAt: now,
              comment: "Auto-validé (création Chef(fe) de service)",
            },
          ]
        : undefined,
    });

    if (autoValidate) {
      const produitCode = parsed.data.produitCode.trim().toUpperCase();
      const operationType = parsed.data.operationType;
      const dateEffet = new Date(parsed.data.dateOperation);
      const contrat = await finalizeContratFromDossier({
        dossierId: dossier._id ?? "",
        concessionnaireId: parsed.data.concessionnaireId,
        produitCode,
        operationType,
        dateEffet,
        actor: auth.user,
      });
      return NextResponse.json({ dossier, contrat }, { status: 201 });
    }

    return NextResponse.json({ dossier }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CONCESSIONNAIRE_BLOQUE") {
      return NextResponse.json({ message: "Concessionnaire bloque." }, { status: 409 });
    }
    if (code === "AGENCE_FORBIDDEN") {
      return NextResponse.json({ message: "Acces refuse pour cette agence." }, { status: 403 });
    }
    if (code === "PRODUIT_INVALID") {
      return NextResponse.json({ message: "Produit invalide." }, { status: 400 });
    }
    if (code === "ACTIVE_CONTRACT_EXISTS") {
      return NextResponse.json(
        { message: "Un contrat actif existe deja pour ce produit et ce concessionnaire." },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: "Creation dossier contrat impossible." }, { status: 500 });
  }
}
