"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { LonaciKpiPayload } from "@/lib/lonaci/lonaci-kpi-types";

type CautionAlert = { id: string; contratId: string; montant: number; dueDate: string; daysOverdue: number };
type SuccessionStale = {
  id: string;
  reference: string;
  concessionnaireId: string;
  daysInactive: number;
};

export default function AlertsPanel() {
  const [kpi, setKpi] = useState<LonaciKpiPayload | null>(null);
  const [cautions, setCautions] = useState<CautionAlert[] | null>(null);
  const [succession, setSuccession] = useState<SuccessionStale[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [kpiRes, cRes, sRes] = await Promise.all([
          fetch("/api/dashboard/kpi", { credentials: "include" }),
          fetch("/api/cautions/alerts", { credentials: "include" }),
          fetch("/api/succession-cases/alerts/stale", { credentials: "include" }),
        ]);
        if (!kpiRes.ok) throw new Error("KPI");
        const k = (await kpiRes.json()) as LonaciKpiPayload;
        setKpi(k);

        if (cRes.ok) {
          const c = (await cRes.json()) as { items: CautionAlert[] };
          setCautions(c.items);
        } else {
          setCautions([]);
        }

        if (sRes.ok) {
          const s = (await sRes.json()) as { items: SuccessionStale[] };
          setSuccession(s.items);
        } else {
          setSuccession([]);
        }
      } catch {
        setError("Impossible de charger les alertes.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Chargement des alertes…
      </section>
    );
  }

  if (error) {
    return <p className="text-sm text-rose-700">{error}</p>;
  }

  const dv = kpi?.dossierValidation;
  const daily = kpi?.daily;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-rose-50/70 via-white to-amber-50/60 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-rose-200/30 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.16em] text-rose-700">LONACI</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Toutes les alertes</h2>
          <p className="mt-1 text-sm text-slate-600">
            Vue consolidée des indicateurs critiques et des listes détaillées selon vos droits d’accès.
          </p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AlertCard
          title="Dossiers contrats en attente"
          value={dv?.contratSoumis ?? 0}
          subtitle={`${dv?.contratSoumisRetard48h ?? 0} sans traitement > 48h`}
          href="/contrats"
          tone="blue"
        />
        <AlertCard
          title="Cautions en attente"
          value={dv?.cautionsEnAttente ?? 0}
          subtitle={`${dv?.cautionsJ10 ?? 0} en retard J+10`}
          href="/cautions"
          tone="amber"
        />
        <AlertCard
          title="Intégrations PDV non finalisées"
          value={daily?.pdvIntegrations?.nonFinalise ?? 0}
          subtitle={`${dv?.pdvEnCoursRetard5j ?? 0} en cours > 5 j.`}
          href="/pdv-integrations"
          tone="violet"
        />
        <AlertCard
          title="Agréments en contrôle"
          value={dv?.agrementsEnAttente ?? 0}
          subtitle={`${dv?.agrementsRetard ?? 0} sans mise à jour > 7 j.`}
          href="/agrements"
          tone="emerald"
        />
        <AlertCard
          title="Successions ouvertes"
          value={dv?.successionOuverts ?? 0}
          subtitle={`${dv?.successionStale30j ?? 0} sans avance > 30 j.`}
          href="/succession"
          tone="rose"
        />
        <AlertCard
          title="PDV non bancarisés"
          value={kpi?.bancarisation?.nonBancarise ?? 0}
          subtitle={`Taux bancarisés : ${kpi?.bancarisation?.tauxBancarisation ?? 0}%`}
          href="/bancarisation"
          tone="slate"
        />
      </div>

      {cautions && cautions.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-900">Cautions dépassées (J+10)</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {cautions.slice(0, 15).map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 text-slate-700">
                <span>
                  Contrat <code className="text-xs text-slate-600">{c.contratId}</code> —{" "}
                  {c.montant.toLocaleString("fr-FR")} FCFA — retard {c.daysOverdue} j.
                </span>
                <Link href="/cautions" className="text-xs font-medium text-amber-700 hover:underline">
                  Voir cautions
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {succession && succession.length > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-rose-900">Successions sans avancement (30 j.)</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {succession.slice(0, 15).map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 text-slate-700">
                <span>
                  {s.reference} — inactif depuis {s.daysInactive} j.
                </span>
                <Link href="/succession" className="text-xs font-medium text-rose-700 hover:underline">
                  Ouvrir succession
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function AlertCard({
  title,
  value,
  subtitle,
  href,
  tone,
}: {
  title: string;
  value: number;
  subtitle: string;
  href: string;
  tone: "blue" | "amber" | "violet" | "rose" | "slate" | "emerald";
}) {
  const border =
    tone === "blue"
      ? "border-blue-200"
      : tone === "amber"
        ? "border-amber-200"
        : tone === "violet"
          ? "border-violet-200"
          : tone === "rose"
            ? "border-rose-200"
            : tone === "emerald"
              ? "border-emerald-200"
              : "border-slate-200";
  return (
    <Link
      href={href}
      className={`block rounded-xl border ${border} bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
    </Link>
  );
}
