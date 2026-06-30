import { getResolvedAlertThresholds } from "@/lib/lonaci/alert-thresholds";
import { restrictionToMongoAgenceFilter } from "@/lib/lonaci/list-agence-restriction";
import { countSuccessionStaleAlerts } from "@/lib/lonaci/succession-stale-alerts";
import { getDatabase } from "@/lib/mongodb";

export type ReportPeriod = "daily" | "weekly" | "monthly";

export interface AgenceComparisonRow {
  agenceId: string;
  agenceCode: string;
  agenceLabel: string;
  dossiersTotal: number;
  dossiersCreatedInWindow: number;
  concessionnairesTotal: number;
  successionOuverts: number;
  pdvNonFinalise: number;
}

export interface ReportProductActiveRow {
  produitCode: string;
  produitLibelle?: string;
  count: number;
}

export interface ReportProductWindowRow {
  produitCode: string;
  produitLibelle?: string;
  currentWindow: number;
  previousWindow: number;
  trendPct: number;
}

function windowForPeriod(period: ReportPeriod): { from: Date; to: Date; label: string } {
  const to = new Date();
  const from = new Date(to);
  if (period === "daily") {
    from.setUTCHours(0, 0, 0, 0);
    return { from, to, label: "jour (UTC)" };
  }
  if (period === "weekly") {
    from.setUTCDate(from.getUTCDate() - 7);
    return { from, to, label: "7 derniers jours" };
  }
  from.setUTCDate(from.getUTCDate() - 30);
  return { from, to, label: "30 derniers jours" };
}

export interface ReportSummary {
  period: ReportPeriod;
  windowLabel: string;
  generatedAt: string;
  windowFrom: string;
  windowTo: string;
  agenceId?: string | null;
  dossiers: {
    total: number;
    byStatus: Record<string, number>;
    createdInWindow: number;
  };
  contrats: { actifs: number; resilie: number; createdInWindow: number };
  concessionnaires: { total: number; byStatut: Record<string, number> };
  cautions: { enAttente: number; alertesJ10: number };
  succession: { ouverts: number; stale30j: number };
  pdvIntegrations: { nonFinalise: number };
  modules: {
    contrats: { actifs: number; resilie: number; createdInWindow: number };
    cautions: { enAttente: number; alertesJ10: number };
    concessionnaires: { total: number };
    dossiers: { total: number; createdInWindow: number };
    succession: { ouverts: number; stale30j: number };
    pdvIntegrations: { nonFinalise: number };
  };
  products: {
    actifsByProduit: ReportProductActiveRow[];
    volumeByProduitWindow: ReportProductWindowRow[];
  };
  agenceComparatif?: AgenceComparisonRow[];
}

export async function buildReportSummary(
  period: ReportPeriod,
  agenceId?: string | null,
  topAgences = 0,
  agenceIds?: string[],
): Promise<ReportSummary> {
  const db = await getDatabase();
  const { from, to, label } = windowForPeriod(period);
  const scopedAgenceId = agenceId?.trim() || null;
  const mongoAgenceFilter = restrictionToMongoAgenceFilter({
    agenceId: scopedAgenceId ?? undefined,
    agenceIds,
  });
  const thr = await getResolvedAlertThresholds();
  const today = new Date();
  const cautionDueThreshold = new Date(today);
  cautionDueThreshold.setDate(today.getDate() - thr.cautionOverdueDays);
  let scopedConcessionnaireIds: string[] | null = null;
  if (mongoAgenceFilter) {
    const rows = await db
      .collection<{ _id: unknown }>("concessionnaires")
      .find({ deletedAt: null, agenceId: mongoAgenceFilter })
      .project({ _id: 1 })
      .toArray();
    scopedConcessionnaireIds = rows.map((r) => String(r._id));
  }

  const dossiersMatch: Record<string, unknown> = { deletedAt: null };
  if (mongoAgenceFilter) dossiersMatch.agenceId = mongoAgenceFilter;

  const contratsMatchBase: Record<string, unknown> = { deletedAt: null };
  if (scopedConcessionnaireIds) {
    if (scopedConcessionnaireIds.length === 0) {
      contratsMatchBase.concessionnaireId = { $in: ["__none__"] };
    } else {
      contratsMatchBase.concessionnaireId = { $in: scopedConcessionnaireIds };
    }
  }

  const concessionnairesMatch: Record<string, unknown> = { deletedAt: null };
  if (mongoAgenceFilter) concessionnairesMatch.agenceId = mongoAgenceFilter;

  const successionMatch: Record<string, unknown> = { deletedAt: null };
  if (mongoAgenceFilter) successionMatch.agenceId = mongoAgenceFilter;

  const pdvIntegrationsMatch: Record<string, unknown> = { deletedAt: null, status: { $ne: "FINALISE" } };
  if (mongoAgenceFilter) pdvIntegrationsMatch.agenceId = mongoAgenceFilter;
  const windowDurationMs = Math.max(0, to.getTime() - from.getTime());
  const previousFrom = new Date(from.getTime() - windowDurationMs);
  const previousTo = from;

  const cautionScopedContratIds = scopedConcessionnaireIds
    ? await db
        .collection<{ _id: unknown }>("contrats")
        .find({ deletedAt: null, concessionnaireId: { $in: scopedConcessionnaireIds } })
        .project({ _id: 1 })
        .toArray()
        .then((rows) => rows.map((r) => String(r._id)))
    : null;

  const cautionsMatchBase: Record<string, unknown> = { deletedAt: null };
  if (cautionScopedContratIds) {
    if (cautionScopedContratIds.length === 0) {
      cautionsMatchBase.contratId = { $in: ["__none__"] };
    } else {
      cautionsMatchBase.contratId = { $in: cautionScopedContratIds };
    }
  }

  const [
    dossierTotal,
    dossierByStatus,
    dossiersCreated,
    contratActifs,
    contratResilie,
    contratsCreated,
    concTotal,
    concByStatut,
    cautionsPending,
    cautionsJ10,
    successionOpen,
    successionStale,
    pdvDraft,
    activeByProduitRows,
    currentByProduitRows,
    previousByProduitRows,
  ] = await Promise.all([
    db.collection("dossiers").countDocuments(dossiersMatch),
    db
      .collection("dossiers")
      .aggregate<{ _id: string; c: number }>([
        { $match: dossiersMatch },
        { $group: { _id: "$status", c: { $sum: 1 } } },
      ])
      .toArray(),
    db.collection("dossiers").countDocuments({
      ...dossiersMatch,
      createdAt: { $gte: from, $lte: to },
    }),
    db.collection("contrats").countDocuments({ ...contratsMatchBase, status: "ACTIF" }),
    db.collection("contrats").countDocuments({ ...contratsMatchBase, status: "RESILIE" }),
    db.collection("contrats").countDocuments({
      ...contratsMatchBase,
      createdAt: { $gte: from, $lte: to },
    }),
    db.collection("concessionnaires").countDocuments(concessionnairesMatch),
    db
      .collection("concessionnaires")
      .aggregate<{ _id: string; c: number }>([
        { $match: concessionnairesMatch },
        { $group: { _id: "$statut", c: { $sum: 1 } } },
      ])
      .toArray(),
    db.collection("cautions").countDocuments({ ...cautionsMatchBase, status: "EN_ATTENTE" }),
    db.collection("cautions").countDocuments({
      ...cautionsMatchBase,
      status: "EN_ATTENTE",
      dueDate: { $lte: cautionDueThreshold },
    }),
    db.collection("succession_cases").countDocuments({ ...successionMatch, status: "OUVERT" }),
    countSuccessionStaleAlerts(scopedAgenceId, agenceIds),
    db.collection("pdv_integrations").countDocuments(pdvIntegrationsMatch),
    db
      .collection("contrats")
      .aggregate<{ _id: string; c: number }>([
        { $match: { ...contratsMatchBase, status: "ACTIF" } },
        { $group: { _id: "$produitCode", c: { $sum: 1 } } },
        { $sort: { c: -1 } },
      ])
      .toArray(),
    db
      .collection("contrats")
      .aggregate<{ _id: string; c: number }>([
        { $match: { ...contratsMatchBase, createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$produitCode", c: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection("contrats")
      .aggregate<{ _id: string; c: number }>([
        { $match: { ...contratsMatchBase, createdAt: { $gte: previousFrom, $lt: previousTo } } },
        { $group: { _id: "$produitCode", c: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of dossierByStatus) {
    byStatus[row._id] = row.c;
  }
  const byStatut: Record<string, number> = {};
  for (const row of concByStatut) {
    byStatut[row._id] = row.c;
  }

  const allProductCodes = [
    ...activeByProduitRows.map((r) => (r._id || "").trim().toUpperCase()),
    ...currentByProduitRows.map((r) => (r._id || "").trim().toUpperCase()),
    ...previousByProduitRows.map((r) => (r._id || "").trim().toUpperCase()),
  ].filter((v) => v.length > 0);
  const uniqueCodes = [...new Set(allProductCodes)];
  const productRefRows =
    uniqueCodes.length > 0
      ? await db
          .collection<{ code: string; libelle: string }>("produits")
          .find({ code: { $in: uniqueCodes }, actif: true }, { projection: { _id: 0, code: 1, libelle: 1 } })
          .toArray()
      : [];
  const productLabelByCode = new Map(
    productRefRows.map((row) => [row.code.trim().toUpperCase(), row.libelle.trim()]),
  );

  const actifsByProduit: ReportProductActiveRow[] = activeByProduitRows.slice(0, 8).map((row) => {
    const code = row._id || "—";
    return {
      produitCode: code,
      produitLibelle: productLabelByCode.get(code.trim().toUpperCase()),
      count: row.c,
    };
  });

  const previousByCode = new Map(previousByProduitRows.map((row) => [row._id || "—", row.c]));
  const volumeByProduitWindow: ReportProductWindowRow[] = currentByProduitRows
    .map((row) => {
      const code = row._id || "—";
      const previous = previousByCode.get(code) ?? 0;
      const trendPct = previous > 0 ? Math.round(((row.c - previous) / previous) * 100) : row.c > 0 ? 100 : 0;
      return {
        produitCode: code,
        produitLibelle: productLabelByCode.get(code.trim().toUpperCase()),
        currentWindow: row.c,
        previousWindow: previous,
        trendPct,
      };
    })
    .sort((a, b) => b.currentWindow - a.currentWindow)
    .slice(0, 10);

  let agenceComparatif: AgenceComparisonRow[] | undefined;
  if (!mongoAgenceFilter && topAgences > 0) {
    const [agencesRows, dossiersTotalByAgence, dossiersCreatedByAgence, concessionnairesByAgence, successionByAgence, pdvByAgence] =
      await Promise.all([
        db
          .collection<{ _id: unknown; code?: string; libelle?: string }>("agences")
          .find({ deletedAt: null })
          .project({ _id: 1, code: 1, libelle: 1 })
          .toArray(),
        db
          .collection("dossiers")
          .aggregate<{ _id: string; c: number }>([
            { $match: { deletedAt: null } },
            { $group: { _id: "$agenceId", c: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection("dossiers")
          .aggregate<{ _id: string; c: number }>([
            { $match: { deletedAt: null, createdAt: { $gte: from, $lte: to } } },
            { $group: { _id: "$agenceId", c: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection("concessionnaires")
          .aggregate<{ _id: string; c: number }>([
            { $match: { deletedAt: null } },
            { $group: { _id: "$agenceId", c: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection("succession_cases")
          .aggregate<{ _id: string; c: number }>([
            { $match: { deletedAt: null, status: "OUVERT" } },
            { $group: { _id: "$agenceId", c: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection("pdv_integrations")
          .aggregate<{ _id: string; c: number }>([
            { $match: { deletedAt: null, status: { $ne: "FINALISE" } } },
            { $group: { _id: "$agenceId", c: { $sum: 1 } } },
          ])
          .toArray(),
      ]);

    const agenceMap = new Map<string, { code: string; libelle: string }>();
    for (const row of agencesRows) {
      const id = String(row._id ?? "");
      agenceMap.set(id, {
        code: row.code ?? id.slice(-6).toUpperCase(),
        libelle: row.libelle ?? "Agence",
      });
    }

    function countsToMap(rows: Array<{ _id: string; c: number }>): Map<string, number> {
      const map = new Map<string, number>();
      for (const row of rows) {
        if (!row._id) continue;
        map.set(String(row._id), row.c);
      }
      return map;
    }

    const dossiersTotals = countsToMap(dossiersTotalByAgence);
    const dossiersCreated = countsToMap(dossiersCreatedByAgence);
    const concessionnairesTotals = countsToMap(concessionnairesByAgence);
    const successionTotals = countsToMap(successionByAgence);
    const pdvTotals = countsToMap(pdvByAgence);

    const agenceIds = new Set<string>([
      ...dossiersTotals.keys(),
      ...dossiersCreated.keys(),
      ...concessionnairesTotals.keys(),
      ...successionTotals.keys(),
      ...pdvTotals.keys(),
      ...agenceMap.keys(),
    ]);

    agenceComparatif = [...agenceIds]
      .map((id) => {
        const agence = agenceMap.get(id);
        return {
          agenceId: id,
          agenceCode: agence?.code ?? id.slice(-6).toUpperCase(),
          agenceLabel: agence?.libelle ?? "Agence",
          dossiersTotal: dossiersTotals.get(id) ?? 0,
          dossiersCreatedInWindow: dossiersCreated.get(id) ?? 0,
          concessionnairesTotal: concessionnairesTotals.get(id) ?? 0,
          successionOuverts: successionTotals.get(id) ?? 0,
          pdvNonFinalise: pdvTotals.get(id) ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.dossiersCreatedInWindow !== a.dossiersCreatedInWindow) {
          return b.dossiersCreatedInWindow - a.dossiersCreatedInWindow;
        }
        if (b.dossiersTotal !== a.dossiersTotal) {
          return b.dossiersTotal - a.dossiersTotal;
        }
        return a.agenceCode.localeCompare(b.agenceCode, "fr", { sensitivity: "base" });
      })
      .slice(0, topAgences);
  }

  return {
    period,
    windowLabel: label,
    generatedAt: new Date().toISOString(),
    windowFrom: from.toISOString(),
    windowTo: to.toISOString(),
    agenceId: scopedAgenceId,
    dossiers: {
      total: dossierTotal,
      byStatus,
      createdInWindow: dossiersCreated,
    },
    contrats: {
      actifs: contratActifs,
      resilie: contratResilie,
      createdInWindow: contratsCreated,
    },
    concessionnaires: { total: concTotal, byStatut },
    cautions: { enAttente: cautionsPending, alertesJ10: cautionsJ10 },
    succession: { ouverts: successionOpen, stale30j: successionStale },
    pdvIntegrations: { nonFinalise: pdvDraft },
    modules: {
      contrats: {
        actifs: contratActifs,
        resilie: contratResilie,
        createdInWindow: contratsCreated,
      },
      cautions: {
        enAttente: cautionsPending,
        alertesJ10: cautionsJ10,
      },
      concessionnaires: {
        total: concTotal,
      },
      dossiers: {
        total: dossierTotal,
        createdInWindow: dossiersCreated,
      },
      succession: {
        ouverts: successionOpen,
        stale30j: successionStale,
      },
      pdvIntegrations: {
        nonFinalise: pdvDraft,
      },
    },
    products: {
      actifsByProduit,
      volumeByProduitWindow,
    },
    agenceComparatif,
  };
}

export function summaryToCsv(summary: ReportSummary): string {
  const lines = [
    "section,cle,valeur",
    `meta,period,${summary.period}`,
    `meta,window,${summary.windowLabel}`,
    `meta,generatedAt,${summary.generatedAt}`,
    `meta,agenceId,${summary.agenceId ?? ""}`,
    `dossiers,total,${summary.dossiers.total}`,
    `dossiers,createdInWindow,${summary.dossiers.createdInWindow}`,
    ...Object.entries(summary.dossiers.byStatus).map(([k, v]) => `dossiers,status_${k},${v}`),
    `contrats,actifs,${summary.contrats.actifs}`,
    `contrats,resilie,${summary.contrats.resilie}`,
    `contrats,createdInWindow,${summary.contrats.createdInWindow}`,
    `concessionnaires,total,${summary.concessionnaires.total}`,
    ...Object.entries(summary.concessionnaires.byStatut).map(
      ([k, v]) => `concessionnaires,statut_${k},${v}`,
    ),
    `cautions,enAttente,${summary.cautions.enAttente}`,
    `cautions,alertesJ10,${summary.cautions.alertesJ10}`,
    `succession,ouverts,${summary.succession.ouverts}`,
    `succession,stale30j,${summary.succession.stale30j}`,
    `pdv,nonFinalise,${summary.pdvIntegrations.nonFinalise}`,
    `modules_contrats,actifs,${summary.modules.contrats.actifs}`,
    `modules_contrats,resilie,${summary.modules.contrats.resilie}`,
    `modules_contrats,createdInWindow,${summary.modules.contrats.createdInWindow}`,
    `modules_cautions,enAttente,${summary.modules.cautions.enAttente}`,
    `modules_cautions,alertesJ10,${summary.modules.cautions.alertesJ10}`,
    `modules_concessionnaires,total,${summary.modules.concessionnaires.total}`,
    `modules_dossiers,total,${summary.modules.dossiers.total}`,
    `modules_dossiers,createdInWindow,${summary.modules.dossiers.createdInWindow}`,
    `modules_succession,ouverts,${summary.modules.succession.ouverts}`,
    `modules_succession,stale30j,${summary.modules.succession.stale30j}`,
    `modules_pdv_integrations,nonFinalise,${summary.modules.pdvIntegrations.nonFinalise}`,
    ...summary.products.actifsByProduit.map((row) => `produits_actifs,${row.produitCode},${row.count}`),
    ...summary.products.volumeByProduitWindow.map(
      (row) =>
        `produits_tendance,${row.produitCode},courant:${row.currentWindow}|precedent:${row.previousWindow}|trend:${row.trendPct}%`,
    ),
  ];
  for (const row of summary.agenceComparatif ?? []) {
    lines.push(`agences,${row.agenceCode}_dossiers_total,${row.dossiersTotal}`);
    lines.push(`agences,${row.agenceCode}_dossiers_created_in_window,${row.dossiersCreatedInWindow}`);
    lines.push(`agences,${row.agenceCode}_concessionnaires_total,${row.concessionnairesTotal}`);
    lines.push(`agences,${row.agenceCode}_succession_ouverts,${row.successionOuverts}`);
    lines.push(`agences,${row.agenceCode}_pdv_non_finalise,${row.pdvNonFinalise}`);
  }
  return lines.join("\n");
}
