"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CLIENT_PDF_COLORS } from "@/lib/pdf/client-premium";

type Period = "daily" | "weekly" | "monthly";

interface ReportSummary {
  period: Period;
  windowLabel: string;
  generatedAt: string;
  dossiers: { total: number; createdInWindow: number; byStatus: Record<string, number> };
  contrats: { actifs: number; resilie: number; createdInWindow: number };
  concessionnaires: { total: number };
  cautions: { enAttente: number; alertesJ10: number };
  succession: { ouverts: number; stale30j: number };
  pdvIntegrations: { nonFinalise: number };
  products: {
    actifsByProduit: Array<{ produitCode: string; produitLibelle?: string; count: number }>;
    volumeByProduitWindow: Array<{
      produitCode: string;
      produitLibelle?: string;
      currentWindow: number;
      previousWindow: number;
      trendPct: number;
    }>;
  };
  agenceComparatif?: Array<{
    agenceId: string;
    agenceCode: string;
    agenceLabel: string;
    dossiersTotal: number;
    dossiersCreatedInWindow: number;
    concessionnairesTotal: number;
    successionOuverts: number;
    pdvNonFinalise: number;
  }>;
}

const PERIOD_LABELS: Record<Period, string> = {
  daily: "Journalier",
  weekly: "Hebdomadaire",
  monthly: "Mensuel",
};

const PRINT_CSS = `
@page { size: A4 portrait; margin: 29mm 12mm 18mm; }
@media print {
  html, body { background: #fff !important; font-size: 10pt; }
  .report-print-root { padding: 0 !important; }
  .report-print-header {
    position: fixed; top: -22mm; left: 0; right: 0; height: 18mm;
  }
  .report-print-footer {
    display: flex !important; position: fixed; bottom: -12mm; left: 0; right: 0;
  }
  .report-print-footer .page-number::after {
    content: "Page " counter(page) " / " counter(pages);
  }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, article, .print-card, .print-signature, .print-qr {
    break-inside: avoid; page-break-inside: avoid;
  }
  table { font-size: 8.5pt; }
  .print\\:hidden { display: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export default function PrintReportClient() {
  const searchParams = useSearchParams();
  const rawPeriod = searchParams.get("period");
  const period: Period = rawPeriod === "weekly" || rawPeriod === "monthly" ? rawPeriod : "daily";
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/reports/summary?period=${period}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Non autorisé ou erreur de chargement.");
        return;
      }
      setSummary((await res.json()) as ReportSummary);
      setError(null);
    })();
  }, [period]);

  const metrics = summary
    ? [
        ["Dossiers", summary.dossiers.total, `${summary.dossiers.createdInWindow} créés sur la période`],
        ["Contrats actifs", summary.contrats.actifs, `${summary.contrats.resilie} résiliés`],
        ["Concessionnaires", summary.concessionnaires.total, "référencés"],
        ["Cautions en attente", summary.cautions.enAttente, `${summary.cautions.alertesJ10} alertes J+10`],
        ["Successions ouvertes", summary.succession.ouverts, `${summary.succession.stale30j} à plus de 30 jours`],
        ["PDV non finalisés", summary.pdvIntegrations.nonFinalise, "intégrations à terminer"],
      ] as const
    : [];

  return (
    <div className="report-print-root min-h-screen bg-slate-100 px-6 py-8 text-slate-900 print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mx-auto max-w-[190mm] bg-white p-8 shadow-xl print:max-w-none print:p-0 print:shadow-none">
        <header
          className="report-print-header border-b-2 pb-3"
          style={{ borderColor: CLIENT_PDF_COLORS.orange }}
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-lg font-black tracking-[0.18em]" style={{ color: CLIENT_PDF_COLORS.orangeDark }}>
                LONACI
              </p>
              <h1 className="text-xl font-bold">Rapport opérationnel {PERIOD_LABELS[period].toLowerCase()}</h1>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Loterie Nationale de Côte d’Ivoire</p>
              <p>{summary ? `Généré le ${new Date(summary.generatedAt).toLocaleString("fr-FR")}` : "Préparation…"}</p>
            </div>
          </div>
        </header>

        <footer className="report-print-footer mt-8 hidden items-center justify-between border-t border-orange-200 pt-2 text-[8pt] text-slate-500">
          <span>LONACI · Rapport interne · {PERIOD_LABELS[period]}</span>
          <span className="page-number" />
        </footer>

        <p className="mt-4 text-sm text-slate-600 print:hidden">
          Vérifiez l’aperçu puis utilisez « Imprimer / PDF ». Le format est optimisé pour une sortie A4.
        </p>

        {error ? <p className="mt-8 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
        {!summary && !error ? <p className="mt-8 text-sm text-slate-500">Chargement du rapport…</p> : null}

        {summary ? (
          <main className="mt-7 space-y-7">
            <section className="print-card rounded-xl border border-orange-200 bg-orange-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: CLIENT_PDF_COLORS.orangeDark }}>
                Périmètre analysé
              </p>
              <p className="mt-1 text-lg font-semibold">{summary.windowLabel}</p>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">Indicateurs clés</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {metrics.map(([label, value, detail]) => (
                  <article key={label} className="print-card rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-black" style={{ color: CLIENT_PDF_COLORS.orangeDark }}>{value}</p>
                    <p className="mt-1 text-xs text-slate-600">{detail}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="print-card">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">Dossiers par statut</h2>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-orange-50 text-slate-700">
                    <tr><th className="px-3 py-2">Statut</th><th className="px-3 py-2 text-right">Volume</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary.dossiers.byStatus).map(([status, count]) => (
                      <tr key={status} className="border-t border-slate-100">
                        <td className="px-3 py-2">{status}</td><td className="px-3 py-2 text-right font-semibold">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {summary.products.volumeByProduitWindow.length > 0 ? (
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">Performance produits</h2>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-orange-50 text-slate-700">
                      <tr>
                        <th className="px-3 py-2">Produit</th><th className="px-3 py-2 text-right">Courant</th>
                        <th className="px-3 py-2 text-right">Précédent</th><th className="px-3 py-2 text-right">Variation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.products.volumeByProduitWindow.map((row) => (
                        <tr key={row.produitCode} className="border-t border-slate-100">
                          <td className="px-3 py-2"><strong>{row.produitCode}</strong>{row.produitLibelle ? ` — ${row.produitLibelle}` : ""}</td>
                          <td className="px-3 py-2 text-right">{row.currentWindow}</td>
                          <td className="px-3 py-2 text-right">{row.previousWindow}</td>
                          <td className="px-3 py-2 text-right font-semibold">{row.trendPct > 0 ? "+" : ""}{row.trendPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {summary.agenceComparatif?.length ? (
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">Comparatif agences</h2>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-orange-50 text-slate-700">
                      <tr>
                        <th className="px-2 py-2">Agence</th><th className="px-2 py-2 text-right">Dossiers</th>
                        <th className="px-2 py-2 text-right">Créés</th><th className="px-2 py-2 text-right">Clients</th>
                        <th className="px-2 py-2 text-right">Successions</th><th className="px-2 py-2 text-right">PDV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.agenceComparatif.map((row) => (
                        <tr key={row.agenceId} className="border-t border-slate-100">
                          <td className="px-2 py-2"><strong>{row.agenceCode}</strong> — {row.agenceLabel}</td>
                          <td className="px-2 py-2 text-right">{row.dossiersTotal}</td>
                          <td className="px-2 py-2 text-right">{row.dossiersCreatedInWindow}</td>
                          <td className="px-2 py-2 text-right">{row.concessionnairesTotal}</td>
                          <td className="px-2 py-2 text-right">{row.successionOuverts}</td>
                          <td className="px-2 py-2 text-right">{row.pdvNonFinalise}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </main>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="fixed bottom-6 right-6 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-lg print:hidden"
        style={{ backgroundColor: CLIENT_PDF_COLORS.orangeDark }}
      >
        Imprimer / PDF
      </button>
    </div>
  );
}
