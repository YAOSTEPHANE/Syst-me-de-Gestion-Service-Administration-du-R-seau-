"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MapPinned } from "lucide-react";

import { Badge } from "@/components/lonaci/ui/badge";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { Card } from "@/components/lonaci/ui/surface";
import type { ContratEtatMensuelMatrixMonth, ContratEtatMensuelMatrixZone } from "@/lib/lonaci/sprint4";

export type ContratEtatMensuelProduitAgenceMatrixProps = {
  domIdPrefix?: string;
  months?: number;
};

function zoneGrandTotal(zone: ContratEtatMensuelMatrixZone): number {
  return zone.produits.reduce((s, r) => s + r.totalContrats, 0);
}

function monthGrandTotal(sec: ContratEtatMensuelMatrixMonth): number {
  return (sec.zoneAbidjan ? zoneGrandTotal(sec.zoneAbidjan) : 0) + (sec.interieur ? zoneGrandTotal(sec.interieur) : 0);
}

function MatrixZoneTable({
  zone,
  variant,
}: {
  zone: ContratEtatMensuelMatrixZone;
  variant: "abidjan" | "interieur";
}) {
  const colCount = zone.agences.length;
  const grandTotal = zoneGrandTotal(zone);
  const colTotals = zone.agences.map((col) =>
    zone.produits.reduce((s, r) => s + (r.valeursParAgence[col.agenceKey] ?? 0), 0),
  );

  const headerRowClass =
    variant === "abidjan"
      ? "border-b border-amber-200/90 bg-amber-50/90"
      : "border-b border-slate-200 bg-slate-100/90";
  const cornerHeaderClass =
    variant === "abidjan"
      ? "sticky left-0 z-20 min-w-36 border-b border-r border-slate-200 bg-amber-50/95 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]"
      : "sticky left-0 z-20 min-w-36 border-b border-r border-slate-200 bg-slate-100/95 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-800 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]";
  const totalColHeaderClass =
    variant === "abidjan"
      ? "border-b border-l border-slate-200 bg-amber-50/95 px-2 py-2 text-center text-[10px] font-semibold text-slate-800"
      : "border-b border-l border-slate-200 bg-slate-100/95 px-2 py-2 text-center text-[10px] font-semibold text-slate-800";
  const footRowClass =
    variant === "abidjan"
      ? "border-t-2 border-amber-200/90 bg-amber-50/90 text-slate-900"
      : "border-t-2 border-slate-200 bg-slate-100/90 text-slate-900";
  const grandCellClass =
    variant === "abidjan"
      ? "border-l border-amber-200/80 bg-amber-100/50 px-2 py-2 text-center tabular-nums font-bold"
      : "border-l border-slate-300 bg-slate-200/50 px-2 py-2 text-center tabular-nums font-bold";

  if (colCount === 0 || zone.produits.length === 0) return null;

  return (
    <table className="w-full min-w-[720px] border-collapse text-left text-[11px] text-slate-800">
      <caption className="sr-only">
        Matrice mensuelle des contrats par produit et agence — zone{" "}
        {variant === "abidjan" ? "Abidjan" : "Intérieur"}
      </caption>
      <thead className="bg-white text-slate-600">
        <tr className={headerRowClass}>
          <th scope="col" className={cornerHeaderClass}>
            Produit
          </th>
          {zone.agences.map((a) => (
            <th
              key={a.agenceKey}
              scope="col"
              className="max-w-28 border-b border-slate-200 px-1.5 py-2 text-center align-bottom text-[10px] font-semibold leading-tight text-slate-700"
              title={a.libelle}
            >
              <span className="line-clamp-3">{a.libelle}</span>
            </th>
          ))}
          <th scope="col" className={totalColHeaderClass}>
            Total
            <br />
            <span className="font-normal text-slate-600">Nb</span>
          </th>
        </tr>
      </thead>
      <tbody className="bg-white">
        {zone.produits.map((row) => (
          <tr key={`${variant}-${row.produitCode}`} className="border-t border-slate-100">
            <th
              scope="row"
              className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-1.5 text-left align-top shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]"
            >
              <span className="font-mono text-[10px] font-semibold text-slate-900">{row.produitCode}</span>
              <span className="mt-0.5 block text-[10px] font-normal text-slate-600">{row.libelle}</span>
            </th>
            {zone.agences.map((col) => {
              const v = row.valeursParAgence[col.agenceKey] ?? 0;
              return (
                <td
                  key={col.agenceKey}
                  className="border-l border-slate-100 px-1.5 py-1.5 text-center tabular-nums text-slate-800"
                  title={`${row.produitCode} / ${col.libelle}`}
                >
                  {v > 0 ? v.toLocaleString("fr-FR") : "—"}
                </td>
              );
            })}
            <td className="border-l border-slate-200 bg-slate-50/80 px-2 py-1.5 text-center tabular-nums font-medium text-slate-900">
              {row.totalContrats > 0 ? row.totalContrats.toLocaleString("fr-FR") : "—"}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className={footRowClass}>
        <tr>
          <th
            scope="row"
            className={`sticky left-0 z-10 border-r px-2 py-2 text-left text-[11px] font-semibold shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] ${
              variant === "abidjan" ? "border-amber-200/80 bg-amber-50/95" : "border-slate-200 bg-slate-100/95"
            }`}
          >
            Total mois
          </th>
          {zone.agences.map((col, i) => (
            <td
              key={col.agenceKey}
              className={`border-l px-1.5 py-2 text-center tabular-nums font-semibold ${
                variant === "abidjan" ? "border-amber-100/80" : "border-slate-200"
              }`}
            >
              {colTotals[i]! > 0 ? colTotals[i]!.toLocaleString("fr-FR") : "—"}
            </td>
          ))}
          <td className={grandCellClass}>{grandTotal.toLocaleString("fr-FR")}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export function ContratEtatMensuelProduitAgenceMatrix({
  domIdPrefix = "contrats-etat-matrix",
  months = 12,
}: ContratEtatMensuelProduitAgenceMatrixProps) {
  const [sections, setSections] = useState<ContratEtatMensuelMatrixMonth[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const m = Math.min(36, Math.max(1, Math.floor(months)));
    setLoading(true);
    try {
      const res = await fetch(`/api/contrats/etat-mensuel-produit-agence?months=${m}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const d = (await res.json()) as { matrix?: ContratEtatMensuelMatrixMonth[] };
        setSections(Array.isArray(d.matrix) ? d.matrix : []);
        setHint(null);
      } else {
        setSections([]);
        setHint("État des contrats (matrice) indisponible.");
      }
    } catch {
      setSections([]);
      setHint("État des contrats (matrice) indisponible.");
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    void load();
    const onDataImported = () => {
      void load();
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
  }, [load]);

  const [expandedYms, setExpandedYms] = useState<Set<string>>(() => new Set());
  const expandUserTouchedRef = useRef(false);

  const ymList = useMemo(() => sections.map((s) => s.yearMonth), [sections]);

  useEffect(() => {
    if (ymList.length === 0) {
      setExpandedYms(new Set());
      expandUserTouchedRef.current = false;
      return;
    }
    setExpandedYms((prev) => {
      const valid = new Set([...prev].filter((k) => ymList.includes(k)));
      if (valid.size > 0 || expandUserTouchedRef.current) return valid;
      return new Set([ymList[0]!]);
    });
  }, [ymList]);

  const toggleMonth = useCallback((ym: string) => {
    expandUserTouchedRef.current = true;
    setExpandedYms((prev) => {
      const next = new Set(prev);
      if (next.has(ym)) next.delete(ym);
      else next.add(ym);
      return next;
    });
  }, []);

  const showBody = sections.length > 0;

  return (
    <Card
      title="État des contrats par mois"
      description="Matrice de couverture des produits par agence, séparée entre Abidjan et l’intérieur."
      action={<MapPinned className="text-orange-600" size={20} aria-hidden="true" />}
      padding="none"
      elevated
      className="overflow-hidden"
    >
      <div className="border-b border-orange-100 bg-orange-50/60 px-4 py-3">
        <p className="mt-1 text-xs text-slate-600">
          {months <= 1
            ? "Dernier mois calendaire."
            : `Les ${months} derniers mois calendaires.`}{" "}
          <strong className="text-slate-800">Lignes</strong> : tous les produits actifs + codes vus sur la période.{" "}
          <strong className="text-slate-800">Colonnes</strong> : toutes les agences actives du référentiel (zone Abidjan
          vs intérieur ; « Sans agence PDV » en colonne si un PDV sans rattachement apparaît sur les contrats). Cases
          sans contrat : « — ». Chaque case = <strong>nombre de contrats saisis</strong> dans le mois.{" "}
          <strong className="text-slate-800">Cliquez un mois</strong> pour afficher ou masquer les matrices.
        </p>
        {hint ? (
          <FeedbackState
            title="Matrice indisponible"
            description={hint}
            tone="warning"
            className="mt-3"
            aria-live="polite"
          />
        ) : null}
      </div>
      <div className="max-h-[min(40rem,60vh)] overflow-auto p-3 sm:p-4">
        {loading ? <Skeleton lines={4} /> : null}
        {!loading && !showBody && !hint ? (
          <FeedbackState
            title="Aucune donnée"
            description="Aucun contrat n’a été saisi sur cette période."
          />
        ) : null}
        {!loading && showBody ? (
          <div className="space-y-5">
            {sections.map((sec) => {
              const isOpen = expandedYms.has(sec.yearMonth);
              const panelId = `${domIdPrefix}-${sec.yearMonth}`;
              const totalMois = monthGrandTotal(sec);
              const na = sec.zoneAbidjan?.agences.length ?? 0;
              const ni = sec.interieur?.agences.length ?? 0;
              const np = Math.max(sec.zoneAbidjan?.produits.length ?? 0, sec.interieur?.produits.length ?? 0);
              const badgeParts: string[] = [];
              if (na > 0) badgeParts.push(`${na} ag. Abj.`);
              if (ni > 0) badgeParts.push(`${ni} ag. int.`);
              const badge = badgeParts.length > 0 ? `${badgeParts.join(" · ")}` : "—";
              const tab = sec.zoneAbidjan && sec.interieur ? "deux matrices" : "une matrice";

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
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleMonth(sec.yearMonth)}
                    className={`flex w-full flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2.5 text-left transition sm:px-4 ${
                      isOpen
                        ? "border-amber-200/80 bg-amber-50/70 hover:bg-amber-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-orange-700 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold capitalize text-slate-900">{sec.moisLabel}</span>
                      <Badge className="max-w-[min(100%,18rem)] truncate sm:max-w-none" title={badge}>
                        {np} prod. max · {badge}
                      </Badge>
                    </span>
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-right">
                      <span className="font-mono text-xs text-slate-500">{sec.yearMonth}</span>
                      <span className="text-[10px] font-medium text-slate-600">
                        Total contrats{" "}
                        <span className="tabular-nums text-slate-900">{totalMois.toLocaleString("fr-FR")}</span>
                      </span>
                    </span>
                  </button>
                  {!isOpen ? (
                    <div className="border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] text-slate-700 sm:px-4">
                      <p className="font-semibold text-slate-800">Résumé</p>
                      <p className="mt-1 tabular-nums">
                        {tab} — zone Abidjan{" "}
                        <strong className="text-slate-900">
                          {(sec.zoneAbidjan ? zoneGrandTotal(sec.zoneAbidjan) : 0).toLocaleString("fr-FR")}
                        </strong>{" "}
                        — intérieur{" "}
                        <strong className="text-slate-900">
                          {(sec.interieur ? zoneGrandTotal(sec.interieur) : 0).toLocaleString("fr-FR")}
                        </strong>
                      </p>
                    </div>
                  ) : null}
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={`${panelId}-trigger`}
                    hidden={!isOpen}
                    className="space-y-6 overflow-x-auto p-2 sm:p-3"
                  >
                    {isOpen ? (
                      <>
                        {sec.zoneAbidjan ? (
                          <div>
                            <Badge tone="brand" className="mb-2">Zone Abidjan</Badge>
                            <MatrixZoneTable zone={sec.zoneAbidjan} variant="abidjan" />
                          </div>
                        ) : null}
                        {sec.interieur ? (
                          <div>
                            <Badge tone="neutral" className="mb-2">Intérieur</Badge>
                            <MatrixZoneTable zone={sec.interieur} variant="interieur" />
                          </div>
                        ) : null}
                        {!sec.zoneAbidjan && !sec.interieur ? (
                          <FeedbackState title="Aucune donnée pour ce mois" />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
