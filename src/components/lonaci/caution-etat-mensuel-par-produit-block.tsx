"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CautionEtatMensuelProduitRow } from "@/lib/lonaci/sprint4";

type MetricsSlice = Pick<
  CautionEtatMensuelProduitRow,
  | "montantAttendusCautions"
  | "nombreCautionsAEncaisser"
  | "montantCautionsAEncaisser"
  | "montantCautionsEncaissees"
  | "nombreCautionsEncaissees"
  | "ecartMontant"
  | "montantCautionsNonEncaissees"
  | "nombreCautionsNonEncaissees"
>;

/** Sommes des indicateurs pour toutes les lignes d’un même mois (par produit). */
function sumEtatMensuelMetricsRows(rows: readonly MetricsSlice[]) {
  const z = {
    montantAttendusCautions: 0,
    nombreCautionsAEncaisser: 0,
    montantCautionsAEncaisser: 0,
    montantCautionsEncaissees: 0,
    nombreCautionsEncaissees: 0,
    ecartMontant: 0,
    montantCautionsNonEncaissees: 0,
    nombreCautionsNonEncaissees: 0,
  };
  for (const r of rows) {
    z.montantAttendusCautions += r.montantAttendusCautions;
    z.nombreCautionsAEncaisser += r.nombreCautionsAEncaisser;
    z.montantCautionsAEncaisser += r.montantCautionsAEncaisser;
    z.montantCautionsEncaissees += r.montantCautionsEncaissees;
    z.nombreCautionsEncaissees += r.nombreCautionsEncaissees;
    z.ecartMontant += r.ecartMontant;
    z.montantCautionsNonEncaissees += r.montantCautionsNonEncaissees;
    z.nombreCautionsNonEncaissees += r.nombreCautionsNonEncaissees;
  }
  return z;
}

/** Part du montant « attendus » par rapport au total du mois (somme des lignes du tableau courant). */
function pctAttendusDuTotalMois(part: number, totalAttendusMois: number): string {
  if (totalAttendusMois <= 0) return "—";
  const pct = (part / totalAttendusMois) * 100;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(pct)}\u00a0%`;
}

export type CautionEtatMensuelParProduitBlockProps = {
  /** Préfixe unique pour les id DOM (accessibilité) si plusieurs blocs coexistent. */
  domIdPrefix?: string;
  months?: number;
};

type MonthSection = {
  yearMonth: string;
  moisLabel: string;
  rows: CautionEtatMensuelProduitRow[];
};

function monthSectionsFromRows(rows: CautionEtatMensuelProduitRow[]): MonthSection[] {
  const indexByYm = new Map<string, number>();
  const out: MonthSection[] = [];
  for (const r of rows) {
    let idx = indexByYm.get(r.yearMonth);
    if (idx === undefined) {
      idx = out.length;
      indexByYm.set(r.yearMonth, idx);
      out.push({ yearMonth: r.yearMonth, moisLabel: r.moisLabel, rows: [] });
    }
    out[idx]!.rows.push(r);
  }
  return out;
}

function TotauxMoisResume({ totals }: { totals: ReturnType<typeof sumEtatMensuelMetricsRows> }) {
  return (
    <div className="border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] text-slate-700 sm:px-4">
      <p className="font-semibold text-slate-800">Totaux du mois</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular-nums leading-snug">
        <span>
          Attendus <strong className="text-slate-900">{totals.montantAttendusCautions.toLocaleString("fr-FR")}</strong>{" "}
          FCFA
        </span>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <span>
          À encaisser <strong className="text-slate-900">{totals.nombreCautionsAEncaisser}</strong> /{" "}
          <strong className="text-slate-900">{totals.montantCautionsAEncaisser.toLocaleString("fr-FR")}</strong> FCFA
        </span>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <span>
          Encaissées <strong className="text-slate-900">{totals.nombreCautionsEncaissees}</strong> /{" "}
          <strong className="text-slate-900">{totals.montantCautionsEncaissees.toLocaleString("fr-FR")}</strong> FCFA
        </span>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <span>
          Écart <strong className="text-slate-900">{totals.ecartMontant.toLocaleString("fr-FR")}</strong> FCFA
        </span>
        <span className="text-slate-300" aria-hidden>
          ·
        </span>
        <span>
          Non enc. <strong className="text-slate-900">{totals.nombreCautionsNonEncaissees}</strong> /{" "}
          <strong className="text-slate-900">{totals.montantCautionsNonEncaissees.toLocaleString("fr-FR")}</strong> FCFA
        </span>
      </p>
    </div>
  );
}

export function CautionEtatMensuelParProduitBlock({
  domIdPrefix = "caution-etat-mensuel",
  months = 12,
}: CautionEtatMensuelParProduitBlockProps) {
  const [rows, setRows] = useState<CautionEtatMensuelProduitRow[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  const sections: MonthSection[] = useMemo(() => monthSectionsFromRows(rows), [rows]);

  const [expandedYms, setExpandedYms] = useState<Set<string>>(() => new Set());
  const expandUserTouchedRef = useRef(false);

  useEffect(() => {
    if (sections.length === 0) {
      setExpandedYms(new Set());
      expandUserTouchedRef.current = false;
      return;
    }
    const keyList = sections.map((s) => s.yearMonth);
    setExpandedYms((prev) => {
      const valid = new Set([...prev].filter((k) => keyList.includes(k)));
      if (valid.size > 0 || expandUserTouchedRef.current) return valid;
      return new Set([keyList[0]!]);
    });
  }, [sections]);

  const toggleMonth = useCallback((ym: string) => {
    expandUserTouchedRef.current = true;
    setExpandedYms((prev) => {
      const next = new Set(prev);
      if (next.has(ym)) next.delete(ym);
      else next.add(ym);
      return next;
    });
  }, []);

  const loadRows = useCallback(async () => {
    const m = Math.min(36, Math.max(1, Math.floor(months)));
    try {
      const er = await fetch(`/api/cautions/etat-mensuel-produits?months=${m}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (er.ok) {
        const d = (await er.json()) as { rows?: CautionEtatMensuelProduitRow[] };
        setRows(Array.isArray(d.rows) ? d.rows : []);
        setHint(null);
      } else {
        setRows([]);
        setHint("État mensuel par produit indisponible.");
      }
    } catch {
      setRows([]);
      setHint("État mensuel par produit indisponible.");
    }
  }, [months]);

  useEffect(() => {
    void loadRows();
    const onDataImported = () => {
      void loadRows();
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
  }, [loadRows]);

  const showBody = rows.length > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-amber-50/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">État des cautions par produit (par mois)</h3>
        <p className="mt-1 text-xs text-slate-600">
          {months <= 1
            ? "Dernier mois calendaire."
            : `Les ${months} derniers mois calendaires.`}{" "}
          Encaissements : cautions <strong>payées</strong> dont la date d’encaissement (
          <code className="rounded bg-white/80 px-1">paidAt</code>) tombe dans le mois. Encours fin de mois : saisie
          avant la fin du mois, non payée avant cette date, non annulée à cette date (statut actuel pour le circuit —
          sans historique détaillé des transitions).{" "}
          <strong className="text-slate-800">Cliquez un mois</strong> pour ouvrir ou fermer son tableau par produit
          (plusieurs mois peuvent rester ouverts). La colonne{" "}
          <strong className="text-slate-800">% du total attendus</strong> indique la part de chaque produit dans la somme
          des montants attendus du mois (100&nbsp;% sur la ligne total).
        </p>
        {hint ? <p className="mt-2 text-xs text-amber-900">{hint}</p> : null}
      </div>
      <div className="max-h-[min(40rem,60vh)] overflow-auto p-3 sm:p-4">
        {!showBody && !hint ? (
          <p className="text-sm text-slate-500">Aucune ligne à afficher.</p>
        ) : !showBody ? null : (
          <div className="space-y-5">
            {sections.map((sec) => {
              const isOpen = expandedYms.has(sec.yearMonth);
              const panelId = `${domIdPrefix}-${sec.yearMonth}`;
              const totals = sumEtatMensuelMetricsRows(sec.rows);
              return (
                <div
                  key={sec.yearMonth}
                  className={`overflow-hidden rounded-xl border shadow-sm transition-colors ${
                    isOpen
                      ? "border-amber-300 bg-amber-50/30 ring-1 ring-amber-200/80"
                      : "border-slate-200 bg-slate-50/40"
                  }`}
                >
                  <button
                    type="button"
                    id={`${panelId}-trigger`}
                    aria-expanded={isOpen ? "true" : "false"}
                    aria-controls={panelId}
                    onClick={() => toggleMonth(sec.yearMonth)}
                    className={`flex w-full flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2.5 text-left transition sm:px-4 ${
                      isOpen
                        ? "border-amber-200/80 bg-amber-50/70 hover:bg-amber-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-block h-0 w-0 border-y-[5px] border-y-transparent border-l-[6px] transition-transform ${
                          isOpen ? "rotate-90 border-l-amber-800" : "border-l-slate-500"
                        }`}
                        aria-hidden
                      />
                      <span className="text-sm font-semibold capitalize text-slate-900">{sec.moisLabel}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {sec.rows.length} produit{sec.rows.length !== 1 ? "s" : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-right">
                      <span className="font-mono text-xs text-slate-500">{sec.yearMonth}</span>
                      <span className="text-[10px] font-medium text-slate-600">
                        Total attendus{" "}
                        <span className="tabular-nums text-slate-900">
                          {totals.montantAttendusCautions.toLocaleString("fr-FR")}
                        </span>{" "}
                        FCFA
                      </span>
                    </span>
                  </button>
                  {!isOpen ? <TotauxMoisResume totals={totals} /> : null}
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={`${panelId}-trigger`}
                    hidden={!isOpen}
                    className="overflow-x-auto p-2 sm:p-3"
                  >
                    {isOpen ? (
                      <table className="w-full min-w-[900px] border-collapse text-left text-[11px] text-slate-800">
                        <thead className="bg-white text-slate-600">
                          <tr className="border-b border-slate-200">
                            <th className="whitespace-nowrap px-2 py-2 font-semibold">Produit</th>
                            <th className="whitespace-pre-line px-2 py-2 font-semibold leading-tight">
                              {"Attendus\nmontants\ncautions (FCFA)"}
                            </th>
                            <th className="whitespace-pre-line px-2 py-2 font-semibold leading-tight">
                              {"%\ndu total\nattendus"}
                            </th>
                            <th className="whitespace-pre-line px-2 py-2 font-semibold leading-tight">
                              {"Nombre de\ncautions à\nencaisser"}
                            </th>
                            <th className="whitespace-pre-line px-2 py-2 font-semibold leading-tight">
                              {"Montant à\nencaisser (FCFA)"}
                            </th>
                            <th className="whitespace-pre-line px-2 py-2 font-semibold leading-tight">
                              {"Cautions\nencaissées\n(FCFA)"}
                            </th>
                            <th className="whitespace-pre-line px-2 py-2 font-semibold leading-tight">
                              {"Nombre de\ncautions\nencaissées"}
                            </th>
                            <th className="whitespace-pre-line px-2 py-2 font-semibold leading-tight">{"Écart\n(FCFA)"}</th>
                            <th className="whitespace-pre-line px-2 py-2 font-semibold leading-tight">
                              {"Cautions\nnon\nencaissées (FCFA)"}
                            </th>
                            <th className="whitespace-pre-line px-2 py-2 font-semibold leading-tight">
                              {"Nombre\ncautions\nnon enc."}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {sec.rows.map((r) => (
                            <tr key={r.produitCode} className="border-t border-slate-100">
                              <td className="px-2 py-1.5 align-top">
                                <span className="font-mono text-[10px] font-semibold">{r.produitCode}</span>
                                <span className="mt-0.5 block text-[10px] text-slate-600">{r.libelle}</span>
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {r.montantAttendusCautions.toLocaleString("fr-FR")}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums text-slate-700">
                                {pctAttendusDuTotalMois(r.montantAttendusCautions, totals.montantAttendusCautions)}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{r.nombreCautionsAEncaisser}</td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {r.montantCautionsAEncaisser.toLocaleString("fr-FR")}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {r.montantCautionsEncaissees.toLocaleString("fr-FR")}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{r.nombreCautionsEncaissees}</td>
                              <td className="px-2 py-1.5 tabular-nums">{r.ecartMontant.toLocaleString("fr-FR")}</td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {r.montantCautionsNonEncaissees.toLocaleString("fr-FR")}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">{r.nombreCautionsNonEncaissees}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-amber-200/90 bg-amber-50/90 text-slate-900">
                          <tr>
                            <th
                              scope="row"
                              className="px-2 py-2 text-left text-[11px] font-semibold tracking-tight"
                            >
                              Total mois
                            </th>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.montantAttendusCautions.toLocaleString("fr-FR")}
                            </td>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.montantAttendusCautions > 0 ? "100\u00a0%" : "—"}
                            </td>
                            <td className="px-2 py-2 tabular-nums font-semibold">{totals.nombreCautionsAEncaisser}</td>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.montantCautionsAEncaisser.toLocaleString("fr-FR")}
                            </td>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.montantCautionsEncaissees.toLocaleString("fr-FR")}
                            </td>
                            <td className="px-2 py-2 tabular-nums font-semibold">{totals.nombreCautionsEncaissees}</td>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.ecartMontant.toLocaleString("fr-FR")}
                            </td>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.montantCautionsNonEncaissees.toLocaleString("fr-FR")}
                            </td>
                            <td className="px-2 py-2 tabular-nums font-semibold">
                              {totals.nombreCautionsNonEncaissees}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
