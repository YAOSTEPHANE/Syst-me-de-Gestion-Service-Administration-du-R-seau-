import type { CautionEtatMensuelProduitRow } from "@/lib/lonaci/sprint4";

type MetricsSlice = Pick<
  CautionEtatMensuelProduitRow,
  | "attendusMontantsSource"
  | "montantAttendusCautions"
  | "nombreCautionsAEncaisser"
  | "montantCautionsEncaissees"
  | "nombreCautionsEncaissees"
  | "montantCautionsNonEncaissees"
  | "nombreCautionsNonEncaissees"
>;

/** Écart (cautions) affiché : aligné sur la colonne « Écart » et la base du % ref. dossiers. */
export function ecartCautionsAffiche(m: MetricsSlice): number {
  return m.nombreCautionsAEncaisser - m.nombreCautionsEncaissees;
}

/** Sommes des indicateurs pour toutes les lignes d’un même mois (par produit). */
export function sumEtatMensuelMetricsRows(rows: readonly MetricsSlice[]) {
  const z = {
    montantAttendusCautions: 0,
    nombreCautionsAEncaisser: 0,
    montantCautionsEncaissees: 0,
    nombreCautionsEncaissees: 0,
    montantCautionsNonEncaissees: 0,
    nombreCautionsNonEncaissees: 0,
  };
  for (const r of rows) {
    z.montantAttendusCautions += r.montantAttendusCautions;
    z.nombreCautionsAEncaisser += r.nombreCautionsAEncaisser;
    z.montantCautionsEncaissees += r.montantCautionsEncaissees;
    z.nombreCautionsEncaissees += r.nombreCautionsEncaissees;
    z.montantCautionsNonEncaissees += r.montantCautionsNonEncaissees;
    z.nombreCautionsNonEncaissees += r.nombreCautionsNonEncaissees;
  }
  const ecartNombreCautionsAffiche = z.nombreCautionsAEncaisser - z.nombreCautionsEncaissees;
  return { ...z, ecartNombreCautionsAffiche };
}

export type EtatMensuelMoisTotals = ReturnType<typeof sumEtatMensuelMetricsRows>;

/**
 * % du total ref. dossiers : pourcentage de l’**Écart** (cautions) — écart de la ligne ÷ somme des écarts du mois
 * (écart = nombre à encaisser affiché − nombre encaissées, comme la colonne « Écart »).
 */
export function pctDuTotalRefDossiers(ecartLigne: number, ecartTotalMois: number): string {
  if (ecartTotalMois === 0) return "—";
  const pct = (ecartLigne / ecartTotalMois) * 100;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(pct)}\u00a0%`;
}

/** Ratio appliqué aux encours (hors encaissées du mois) lorsque l’attendu admin diffère du total dossiers. */
function correctionAttenduRatio(row: CautionEtatMensuelProduitRow): number {
  if (row.attendusMontantsSource !== "ADMIN") return 1;
  const doss = row.attendusMontantDossiers ?? row.montantAttendusCautions;
  if (!Number.isFinite(doss) || doss <= 0) return 1;
  return row.montantAttendusCautions / doss;
}

/** Stock dossier ramené au montant « à encaisser » affiché (prorata admin si besoin). */
function nombreCautionsStockAuProrata(row: CautionEtatMensuelProduitRow, k: number): number {
  const n = row.nombreCautionsAEncaisser;
  const mAe = row.montantCautionsAEncaisser;
  if (n <= 0 || mAe <= 0) return 0;
  const avgAe = mAe / n;
  const mAeAff = Math.max(0, Math.round(mAe * k));
  return Math.max(0, Math.round(mAeAff / avgAe));
}

/**
 * Nombre à encaisser affiché : arrondi de **Attendus montants cautions (FCFA) / Cautions encaissées (FCFA)** sur la ligne.
 * Si aucune caution encaissée dans le mois (dénominateur nul), repli sur le stock au prorata (cohérent avec les montants affichés).
 */
function displayedNombreCautionsAEncaisser(row: CautionEtatMensuelProduitRow, k: number): number {
  const mAtt = row.montantAttendusCautions;
  const mEnc = row.montantCautionsEncaissees;
  if (mEnc > 0) {
    return Math.max(0, Math.round(mAtt / mEnc));
  }
  return nombreCautionsStockAuProrata(row, k);
}

/**
 * Métriques affichées : encaissements du mois = montants réels. **Cautions non encaissées (FCFA)** = attendu − encaissées.
 * Le **nombre** à encaisser affiché vaut arrondi(attendu FCFA / encaissées FCFA du mois), ou le stock au prorata si encaissées = 0.
 */
export function displayEtatRowMetrics(row: CautionEtatMensuelProduitRow): MetricsSlice {
  const k = correctionAttenduRatio(row);
  const mNonEncAff = row.montantAttendusCautions - row.montantCautionsEncaissees;
  return {
    attendusMontantsSource: row.attendusMontantsSource,
    montantAttendusCautions: row.montantAttendusCautions,
    nombreCautionsAEncaisser: displayedNombreCautionsAEncaisser(row, k),
    montantCautionsEncaissees: row.montantCautionsEncaissees,
    nombreCautionsEncaissees: row.nombreCautionsEncaissees,
    montantCautionsNonEncaissees: mNonEncAff,
    nombreCautionsNonEncaissees: row.nombreCautionsNonEncaissees,
  };
}

export function monthUsesAttenduProrata(rows: readonly CautionEtatMensuelProduitRow[]): boolean {
  return rows.some((r) => {
    const k = correctionAttenduRatio(r);
    if (k !== 1) return true;
    return displayedNombreCautionsAEncaisser(r, k) !== r.nombreCautionsAEncaisser;
  });
}

/**
 * Agrège le **dernier mois** présent dans les lignes API (ordre lexicographique `yearMonth`, ex. `YYYY-MM`).
 * Même logique d’affichage que le tableau « État mensuel par produit ».
 */
export function aggregateEtatMensuelLatestMonth(
  rows: readonly CautionEtatMensuelProduitRow[],
): { yearMonth: string; moisLabel: string; totals: EtatMensuelMoisTotals } | null {
  if (rows.length === 0) return null;
  const latestYm = rows.reduce((best, r) => (r.yearMonth > best ? r.yearMonth : best), rows[0]!.yearMonth);
  const monthRows = rows.filter((r) => r.yearMonth === latestYm);
  if (monthRows.length === 0) return null;
  const moisLabel = monthRows[0]!.moisLabel;
  return {
    yearMonth: latestYm,
    moisLabel,
    totals: sumEtatMensuelMetricsRows(monthRows.map(displayEtatRowMetrics)),
  };
}
