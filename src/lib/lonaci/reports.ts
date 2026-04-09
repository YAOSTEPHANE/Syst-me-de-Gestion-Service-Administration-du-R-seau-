import { getResolvedAlertThresholds } from "@/lib/lonaci/alert-thresholds";
import { getDatabase } from "@/lib/mongodb";

export type ReportPeriod = "daily" | "weekly" | "monthly";

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
}

export async function buildReportSummary(period: ReportPeriod, agenceId?: string | null): Promise<ReportSummary> {
  const db = await getDatabase();
  const { from, to, label } = windowForPeriod(period);
  const scopedAgenceId = agenceId?.trim() || null;
  const thr = await getResolvedAlertThresholds();
  const today = new Date();
  const cautionDueThreshold = new Date(today);
  cautionDueThreshold.setDate(today.getDate() - thr.cautionOverdueDays);
  const successionStaleThreshold = new Date(Date.now() - thr.successionStaleDays * 24 * 60 * 60 * 1000);

  let scopedConcessionnaireIds: string[] | null = null;
  if (scopedAgenceId) {
    const rows = await db
      .collection<{ _id: unknown }>("concessionnaires")
      .find({ deletedAt: null, agenceId: scopedAgenceId })
      .project({ _id: 1 })
      .toArray();
    scopedConcessionnaireIds = rows.map((r) => String(r._id));
  }

  const dossiersMatch: Record<string, unknown> = { deletedAt: null };
  if (scopedAgenceId) dossiersMatch.agenceId = scopedAgenceId;

  const contratsMatchBase: Record<string, unknown> = { deletedAt: null };
  if (scopedConcessionnaireIds) {
    if (scopedConcessionnaireIds.length === 0) {
      contratsMatchBase.concessionnaireId = { $in: ["__none__"] };
    } else {
      contratsMatchBase.concessionnaireId = { $in: scopedConcessionnaireIds };
    }
  }

  const concessionnairesMatch: Record<string, unknown> = { deletedAt: null };
  if (scopedAgenceId) concessionnairesMatch.agenceId = scopedAgenceId;

  const successionMatch: Record<string, unknown> = { deletedAt: null };
  if (scopedAgenceId) successionMatch.agenceId = scopedAgenceId;

  const pdvIntegrationsMatch: Record<string, unknown> = { deletedAt: null, status: { $ne: "FINALISE" } };
  if (scopedAgenceId) pdvIntegrationsMatch.agenceId = scopedAgenceId;

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
    db.collection("succession_cases").countDocuments({
      ...successionMatch,
      status: "OUVERT",
      updatedAt: { $lte: successionStaleThreshold },
    }),
    db.collection("pdv_integrations").countDocuments(pdvIntegrationsMatch),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of dossierByStatus) {
    byStatus[row._id] = row.c;
  }
  const byStatut: Record<string, number> = {};
  for (const row of concByStatut) {
    byStatut[row._id] = row.c;
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
  ];
  return lines.join("\n");
}
