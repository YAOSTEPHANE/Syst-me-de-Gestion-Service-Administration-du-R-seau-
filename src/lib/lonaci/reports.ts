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
}

export async function buildReportSummary(period: ReportPeriod): Promise<ReportSummary> {
  const db = await getDatabase();
  const { from, to, label } = windowForPeriod(period);
  const thr = await getResolvedAlertThresholds();
  const today = new Date();
  const cautionDueThreshold = new Date(today);
  cautionDueThreshold.setDate(today.getDate() - thr.cautionOverdueDays);
  const successionStaleThreshold = new Date(Date.now() - thr.successionStaleDays * 24 * 60 * 60 * 1000);

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
    db.collection("dossiers").countDocuments({ deletedAt: null }),
    db
      .collection("dossiers")
      .aggregate<{ _id: string; c: number }>([
        { $match: { deletedAt: null } },
        { $group: { _id: "$status", c: { $sum: 1 } } },
      ])
      .toArray(),
    db.collection("dossiers").countDocuments({
      deletedAt: null,
      createdAt: { $gte: from, $lte: to },
    }),
    db.collection("contrats").countDocuments({ deletedAt: null, status: "ACTIF" }),
    db.collection("contrats").countDocuments({ deletedAt: null, status: "RESILIE" }),
    db.collection("contrats").countDocuments({
      deletedAt: null,
      createdAt: { $gte: from, $lte: to },
    }),
    db.collection("concessionnaires").countDocuments({ deletedAt: null }),
    db
      .collection("concessionnaires")
      .aggregate<{ _id: string; c: number }>([
        { $match: { deletedAt: null } },
        { $group: { _id: "$statut", c: { $sum: 1 } } },
      ])
      .toArray(),
    db.collection("cautions").countDocuments({ deletedAt: null, status: "EN_ATTENTE" }),
    db.collection("cautions").countDocuments({
      deletedAt: null,
      status: "EN_ATTENTE",
      dueDate: { $lte: cautionDueThreshold },
    }),
    db.collection("succession_cases").countDocuments({ deletedAt: null, status: "OUVERT" }),
    db.collection("succession_cases").countDocuments({
      deletedAt: null,
      status: "OUVERT",
      updatedAt: { $lte: successionStaleThreshold },
    }),
    db.collection("pdv_integrations").countDocuments({
      deletedAt: null,
      status: { $ne: "FINALISE" },
    }),
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
  };
}

export function summaryToCsv(summary: ReportSummary): string {
  const lines = [
    "section,cle,valeur",
    `meta,period,${summary.period}`,
    `meta,window,${summary.windowLabel}`,
    `meta,generatedAt,${summary.generatedAt}`,
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
  ];
  return lines.join("\n");
}
