import { getResolvedAlertThresholds } from "@/lib/lonaci/alert-thresholds";
import { getDatabase } from "@/lib/mongodb";

export interface ActivityDay {
  label: string;
  contracts: number;
  cautions: number;
  integrations: number;
}

async function getScopedConcessionnaireIds(agenceId?: string | null): Promise<string[] | null> {
  const scopedAgenceId = agenceId?.trim();
  if (!scopedAgenceId) return null;
  const db = await getDatabase();
  const rows = await db
    .collection<{ _id: unknown }>("concessionnaires")
    .find({ deletedAt: null, agenceId: scopedAgenceId }, { projection: { _id: 1 } })
    .toArray();
  return rows.map((r) => String(r._id));
}

export async function getActivityLast7Days(agenceId?: string | null): Promise<ActivityDay[]> {
  const db = await getDatabase();
  const scopedConcessionnaireIds = await getScopedConcessionnaireIds(agenceId);
  let scopedContratIds: string[] | null = null;
  if (scopedConcessionnaireIds) {
    if (scopedConcessionnaireIds.length === 0) {
      scopedContratIds = [];
    } else {
      const contrats = await db
        .collection<{ _id: unknown }>("contrats")
        .find({ deletedAt: null, concessionnaireId: { $in: scopedConcessionnaireIds } }, { projection: { _id: 1 } })
        .toArray();
      scopedContratIds = contrats.map((r) => String(r._id));
    }
  }
  const days: { label: string; start: Date; end: Date }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - i);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const label = start.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    days.push({ label, start, end });
  }

  const out: ActivityDay[] = [];
  for (const { label, start, end } of days) {
    const [contracts, cautions, integrations] = await Promise.all([
      db.collection("contrats").countDocuments({
        deletedAt: null,
        createdAt: { $gte: start, $lt: end },
        ...(scopedConcessionnaireIds
          ? { concessionnaireId: { $in: scopedConcessionnaireIds.length ? scopedConcessionnaireIds : ["__none__"] } }
          : {}),
      }),
      db.collection("cautions").countDocuments({
        deletedAt: null,
        createdAt: { $gte: start, $lt: end },
        ...(scopedContratIds
          ? { contratId: { $in: scopedContratIds.length ? scopedContratIds : ["__none__"] } }
          : {}),
      }),
      db.collection("pdv_integrations").countDocuments({
        deletedAt: null,
        createdAt: { $gte: start, $lt: end },
        ...(agenceId?.trim() ? { agenceId: agenceId.trim() } : {}),
      }),
    ]);
    out.push({ label, contracts, cautions, integrations });
  }
  return out;
}

export interface ProduitSlice {
  code: string;
  count: number;
}

export async function getContratsActifsByProduit(topN = 5, agenceId?: string | null): Promise<ProduitSlice[]> {
  const db = await getDatabase();
  const scopedConcessionnaireIds = await getScopedConcessionnaireIds(agenceId);
  const contratFilter: Record<string, unknown> = { deletedAt: null, status: "ACTIF" };
  if (scopedConcessionnaireIds) {
    contratFilter.concessionnaireId = { $in: scopedConcessionnaireIds.length ? scopedConcessionnaireIds : ["__none__"] };
  }
  const rows = await db
    .collection("contrats")
    .aggregate<{ _id: string; c: number }>([
      { $match: contratFilter },
      { $group: { _id: "$produitCode", c: { $sum: 1 } } },
      { $sort: { c: -1 } },
    ])
    .toArray();

  const total = rows.reduce((s, r) => s + r.c, 0);
  if (total === 0) return [];

  const top = rows.slice(0, topN);
  const topSum = top.reduce((s, r) => s + r.c, 0);
  const autres = total - topSum;
  const slices: ProduitSlice[] = top.map((r) => ({ code: r._id || "—", count: r.c }));
  if (autres > 0) {
    slices.push({ code: "Autres", count: autres });
  }
  return slices;
}

export interface DossierValidationSnapshot {
  contratSoumis: number;
  contratSoumisRetard48h: number;
  cautionsEnAttente: number;
  cautionsJ10: number;
  pdvNonFinalise: number;
  pdvEnCoursRetard5j: number;
  successionOuverts: number;
  successionStale30j: number;
  /** Agréments en contrôle (registre, statuts EN_COURS ou SOUMIS) */
  agrementsEnAttente: number;
  /** Agréments SOUMIS sans mise à jour depuis 7 j. */
  agrementsRetard: number;
}

export interface BancarisationSnapshot {
  nonBancarise: number;
  enCours: number;
  bancarise: number;
  total: number;
  tauxBancarisation: number;
}

export interface AgenceTrendItem {
  agenceId: string | null;
  agenceLabel: string;
  /** Code référentiel (pour tri / affichage compact) */
  agenceCode?: string;
  /** Agence active dans le référentiel */
  actif?: boolean;
  contrats30j: number;
  cautions30j: number;
  integrations30j: number;
  total30j: number;
}

export interface TopConcessionnaireItem {
  concessionnaireId: string;
  codePdv: string;
  nomComplet: string;
  contratsActifs: number;
}

export interface DossierDelaySnapshot {
  avgSubmitHours: number;
  avgN1Hours: number;
  avgN2Hours: number;
  avgFinalizeHours: number;
  sampleSize: number;
}

export interface ProduitVolume30jItem {
  produitCode: string;
  current30d: number;
  previous30d: number;
  trendPct: number;
}

export async function getAgrementRegistryQueueCounts(staleDays: number): Promise<{ enAttente: number; retard: number }> {
  const db = await getDatabase();
  const base = { module: "AGREMENT" as const, deletedAt: null };
  const staleBefore = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const [enAttente, retard] = await Promise.all([
    db.collection("lonaci_registries").countDocuments({
      ...base,
      statut: { $in: ["EN_COURS", "SOUMIS"] },
    }),
    db.collection("lonaci_registries").countDocuments({
      ...base,
      statut: "SOUMIS",
      updatedAt: { $lt: staleBefore },
    }),
  ]);
  return { enAttente, retard };
}

export async function getDossierValidationSnapshot(
  cautionsJ10Count: number,
  successionOpen: number,
  successionStale: number,
  pdvNonFinalise: number,
  agenceId?: string | null,
): Promise<DossierValidationSnapshot> {
  const db = await getDatabase();
  const thr = await getResolvedAlertThresholds();
  const filter: Record<string, unknown> = { deletedAt: null, type: "CONTRAT_ACTUALISATION" as const };
  if (agenceId?.trim()) filter.agenceId = agenceId.trim();
  const dossierIdleBefore = new Date(Date.now() - thr.dossierIdleMs);
  const pdvStaleBefore = new Date(Date.now() - thr.pdvIntegrationMaxMs);
  const scopedConcessionnaireIds = await getScopedConcessionnaireIds(agenceId);
  let scopedContratIds: string[] | null = null;
  if (scopedConcessionnaireIds) {
    if (scopedConcessionnaireIds.length === 0) {
      scopedContratIds = [];
    } else {
      const contrats = await db
        .collection<{ _id: unknown }>("contrats")
        .find({ deletedAt: null, concessionnaireId: { $in: scopedConcessionnaireIds } }, { projection: { _id: 1 } })
        .toArray();
      scopedContratIds = contrats.map((r) => String(r._id));
    }
  }

  const [contratSoumis, contratSoumisRetard48h, cautionsEnAttente, pdvEnCoursRetard5j, agrementQueue] =
    await Promise.all([
      db.collection("dossiers").countDocuments({ ...filter, status: "SOUMIS" }),
      db.collection("dossiers").countDocuments({
        ...filter,
        status: "SOUMIS",
        updatedAt: { $lt: dossierIdleBefore },
      }),
      db.collection("cautions").countDocuments({
        deletedAt: null,
        status: "EN_ATTENTE",
        ...(scopedContratIds
          ? { contratId: { $in: scopedContratIds.length ? scopedContratIds : ["__none__"] } }
          : {}),
      }),
      db.collection("pdv_integrations").countDocuments({
        deletedAt: null,
        status: { $in: ["BROUILLON", "EN_COURS"] },
        updatedAt: { $lt: pdvStaleBefore },
        ...(agenceId?.trim() ? { agenceId: agenceId.trim() } : {}),
      }),
      getAgrementRegistryQueueCounts(thr.agrementStaleDays),
    ]);

  return {
    contratSoumis,
    contratSoumisRetard48h,
    cautionsEnAttente,
    cautionsJ10: cautionsJ10Count,
    pdvNonFinalise,
    pdvEnCoursRetard5j,
    successionOuverts: successionOpen,
    successionStale30j: successionStale,
    agrementsEnAttente: agrementQueue.enAttente,
    agrementsRetard: agrementQueue.retard,
  };
}

export async function getBancarisationSnapshot(agenceId?: string | null): Promise<BancarisationSnapshot> {
  const db = await getDatabase();
  const concFilter: Record<string, unknown> = { deletedAt: null };
  if (agenceId?.trim()) concFilter.agenceId = agenceId.trim();
  const rows = await db
    .collection("concessionnaires")
    .aggregate<{ _id: string; c: number }>([
      { $match: concFilter },
      { $group: { _id: "$statutBancarisation", c: { $sum: 1 } } },
    ])
    .toArray();

  let nonBancarise = 0;
  let enCours = 0;
  let bancarise = 0;
  for (const row of rows) {
    if (row._id === "NON_BANCARISE") nonBancarise = row.c;
    if (row._id === "EN_COURS") enCours = row.c;
    if (row._id === "BANCARISE") bancarise = row.c;
  }
  const total = nonBancarise + enCours + bancarise;
  const tauxBancarisation = total > 0 ? Math.round((bancarise / total) * 100) : 0;

  return { nonBancarise, enCours, bancarise, total, tauxBancarisation };
}

async function computeAgenceTrends30DaysMerged(seedAllFromCatalog: boolean): Promise<Map<string, AgenceTrendItem>> {
  const db = await getDatabase();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [agences, contrats, cautions, integrations] = await Promise.all([
    db
      .collection("agences")
      .find({}, { projection: { _id: 1, code: 1, libelle: 1, actif: 1 } })
      .sort({ code: 1 })
      .toArray(),
    db
      .collection("contrats")
      .aggregate<{ _id: string | null; c: number }>([
        { $match: { deletedAt: null, createdAt: { $gte: from } } },
        {
          $lookup: {
            from: "concessionnaires",
            localField: "concessionnaireId",
            foreignField: "_id",
            as: "concessionnaire",
          },
        },
        { $unwind: { path: "$concessionnaire", preserveNullAndEmptyArrays: true } },
        { $group: { _id: "$concessionnaire.agenceId", c: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection("cautions")
      .aggregate<{ _id: string | null; c: number }>([
        { $match: { deletedAt: null, createdAt: { $gte: from } } },
        {
          $lookup: {
            from: "contrats",
            localField: "contratId",
            foreignField: "_id",
            as: "contrat",
          },
        },
        { $unwind: { path: "$contrat", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "concessionnaires",
            localField: "contrat.concessionnaireId",
            foreignField: "_id",
            as: "concessionnaire",
          },
        },
        { $unwind: { path: "$concessionnaire", preserveNullAndEmptyArrays: true } },
        { $group: { _id: "$concessionnaire.agenceId", c: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection("pdv_integrations")
      .aggregate<{ _id: string | null; c: number }>([
        { $match: { deletedAt: null, createdAt: { $gte: from } } },
        { $group: { _id: "$agenceId", c: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const agenceMap = new Map<string, string>();
  const agenceMeta = new Map<string, { code: string; actif: boolean }>();
  for (const a of agences) {
    const id = a?._id?.toString?.() ?? "";
    const label = [a?.code, a?.libelle].filter(Boolean).join(" - ") || "Agence";
    if (id) {
      agenceMap.set(id, label);
      agenceMeta.set(id, {
        code: typeof a?.code === "string" ? a.code : "",
        actif: a?.actif !== false,
      });
    }
  }

  const ensure = (map: Map<string, AgenceTrendItem>, agenceId: string | null) => {
    const key = agenceId ?? "null";
    const existing = map.get(key);
    if (existing) return existing;
    const label = agenceId ? agenceMap.get(agenceId) ?? `Agence ${agenceId.slice(0, 6)}` : "Non rattachée";
    const meta = agenceId ? agenceMeta.get(agenceId) : undefined;
    const created: AgenceTrendItem = {
      agenceId,
      agenceLabel: label,
      agenceCode: meta?.code,
      actif: meta?.actif,
      contrats30j: 0,
      cautions30j: 0,
      integrations30j: 0,
      total30j: 0,
    };
    map.set(key, created);
    return created;
  };

  const merged = new Map<string, AgenceTrendItem>();
  if (seedAllFromCatalog) {
    for (const a of agences) {
      const id = a?._id?.toString?.() ?? "";
      if (id) ensure(merged, id);
    }
  }

  for (const row of contrats) ensure(merged, row._id ?? null).contrats30j = row.c;
  for (const row of cautions) ensure(merged, row._id ?? null).cautions30j = row.c;
  for (const row of integrations) ensure(merged, row._id ?? null).integrations30j = row.c;
  for (const item of merged.values()) {
    item.total30j = item.contrats30j + item.cautions30j + item.integrations30j;
  }

  return merged;
}

/** Top N agences par volume d’activité (30 j.) — comportement historique du tableau de bord. */
export async function getAgenceTrendsLast30Days(topN = 8): Promise<AgenceTrendItem[]> {
  const merged = await computeAgenceTrends30DaysMerged(false);
  return [...merged.values()].sort((a, b) => b.total30j - a.total30j).slice(0, topN);
}

/** Toutes les agences du référentiel avec volumes 30 j. (y compris à zéro), tri par code. */
export async function getAllAgencesTrendsLast30Days(agenceId?: string | null): Promise<AgenceTrendItem[]> {
  const merged = await computeAgenceTrends30DaysMerged(true);
  const scopedAgenceId = agenceId?.trim();
  const list = [...merged.values()].filter((a) => a.agenceId !== null && (!scopedAgenceId || a.agenceId === scopedAgenceId));
  return list.sort((a, b) => {
    const ca = a.agenceCode ?? a.agenceLabel;
    const cb = b.agenceCode ?? b.agenceLabel;
    return ca.localeCompare(cb, "fr", { sensitivity: "base" });
  });
}

export async function getTopConcessionnairesActifs(topN = 5, agenceId?: string | null): Promise<TopConcessionnaireItem[]> {
  const db = await getDatabase();
  const scopedConcessionnaireIds = await getScopedConcessionnaireIds(agenceId);
  const contratFilter: Record<string, unknown> = { deletedAt: null, status: "ACTIF" };
  if (scopedConcessionnaireIds) {
    contratFilter.concessionnaireId = { $in: scopedConcessionnaireIds.length ? scopedConcessionnaireIds : ["__none__"] };
  }
  const rows = await db
    .collection("contrats")
    .aggregate<{
      _id: string;
      c: number;
      concessionnaire: { codePdv?: string; nomComplet?: string; raisonSociale?: string }[];
    }>([
      { $match: contratFilter },
      { $group: { _id: "$concessionnaireId", c: { $sum: 1 } } },
      { $sort: { c: -1 } },
      { $limit: topN },
      {
        $lookup: {
          from: "concessionnaires",
          localField: "_id",
          foreignField: "_id",
          as: "concessionnaire",
        },
      },
    ])
    .toArray();

  return rows.map((row) => {
    const c = row.concessionnaire[0];
    return {
      concessionnaireId: row._id,
      codePdv: c?.codePdv ?? "—",
      nomComplet: c?.nomComplet ?? c?.raisonSociale ?? "Concessionnaire",
      contratsActifs: row.c,
    };
  });
}

export async function getDossierDelaySnapshotLast30Days(agenceId?: string | null): Promise<DossierDelaySnapshot> {
  const db = await getDatabase();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dossierFilter: Record<string, unknown> = { deletedAt: null, createdAt: { $gte: from } };
  if (agenceId?.trim()) dossierFilter.agenceId = agenceId.trim();
  const rows = await db
    .collection("dossiers")
    .find(
      dossierFilter,
      { projection: { createdAt: 1, history: 1 } },
    )
    .toArray();

  const submit: number[] = [];
  const n1: number[] = [];
  const n2: number[] = [];
  const finalize: number[] = [];

  for (const row of rows) {
    const createdAt = row.createdAt instanceof Date ? row.createdAt : null;
    const history = Array.isArray(row.history) ? row.history : [];
    if (!createdAt) continue;

    const findStatusTime = (status: string) => {
      const hit = history.find((h) => h?.status === status && h?.actedAt instanceof Date);
      return hit?.actedAt instanceof Date ? hit.actedAt : null;
    };

    const submittedAt = findStatusTime("SOUMIS");
    const n1At = findStatusTime("VALIDE_N1");
    const n2At = findStatusTime("VALIDE_N2");
    const finalizedAt = findStatusTime("FINALISE");

    if (submittedAt) submit.push((submittedAt.getTime() - createdAt.getTime()) / 36e5);
    if (n1At) n1.push((n1At.getTime() - createdAt.getTime()) / 36e5);
    if (n2At) n2.push((n2At.getTime() - createdAt.getTime()) / 36e5);
    if (finalizedAt) finalize.push((finalizedAt.getTime() - createdAt.getTime()) / 36e5);
  }

  const avg = (arr: number[]) =>
    arr.length ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : 0;

  return {
    avgSubmitHours: avg(submit),
    avgN1Hours: avg(n1),
    avgN2Hours: avg(n2),
    avgFinalizeHours: avg(finalize),
    sampleSize: rows.length,
  };
}

export async function getProduitVolumesLast30Days(topN = 8, agenceId?: string | null): Promise<ProduitVolume30jItem[]> {
  const db = await getDatabase();
  const now = Date.now();
  const currentFrom = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const previousFrom = new Date(now - 60 * 24 * 60 * 60 * 1000);
  const previousTo = currentFrom;
  const scopedConcessionnaireIds = await getScopedConcessionnaireIds(agenceId);
  const scopeMatch = scopedConcessionnaireIds
    ? { concessionnaireId: { $in: scopedConcessionnaireIds.length ? scopedConcessionnaireIds : ["__none__"] } }
    : {};

  const [currentRows, previousRows] = await Promise.all([
    db
      .collection("contrats")
      .aggregate<{ _id: string; c: number }>([
        { $match: { deletedAt: null, createdAt: { $gte: currentFrom }, ...scopeMatch } },
        { $group: { _id: "$produitCode", c: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection("contrats")
      .aggregate<{ _id: string; c: number }>([
        { $match: { deletedAt: null, createdAt: { $gte: previousFrom, $lt: previousTo }, ...scopeMatch } },
        { $group: { _id: "$produitCode", c: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const prevMap = new Map(previousRows.map((r) => [r._id, r.c]));
  const merged = currentRows.map((r) => {
    const prev = prevMap.get(r._id) ?? 0;
    const trendPct = prev > 0 ? Math.round(((r.c - prev) / prev) * 100) : r.c > 0 ? 100 : 0;
    return {
      produitCode: r._id || "—",
      current30d: r.c,
      previous30d: prev,
      trendPct,
    };
  });

  return merged.sort((a, b) => b.current30d - a.current30d).slice(0, topN);
}
