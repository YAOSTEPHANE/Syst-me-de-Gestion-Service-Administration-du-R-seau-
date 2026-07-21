"use client";

import Link from "next/link";
import { AlertTriangle, Download, MapPin, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { FilterBar } from "@/components/lonaci/ui/filter-bar";
import { PageHeader, SectionHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
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
  const [search, setSearch] = useState("");
  const [minDays, setMinDays] = useState(0);

  async function loadAlerts() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          minDaysOverdue: String(minDays),
          minDaysInactive: String(minDays),
          limit: "200",
        });
        const [kpiRes, cRes, sRes] = await Promise.all([
          fetch("/api/dashboard/kpi", { credentials: "include" }),
          fetch(`/api/cautions/alerts?${params.toString()}`, { credentials: "include" }),
          fetch(`/api/succession-cases/alerts/stale?${params.toString()}`, { credentials: "include" }),
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
  }

  useEffect(() => {
    void loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDays]);

  const filteredCautions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cautions ?? [];
    return (cautions ?? []).filter(
      (row) => row.contratId.toLowerCase().includes(q) || row.id.toLowerCase().includes(q),
    );
  }, [cautions, search]);

  const filteredSuccession = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return succession ?? [];
    return (succession ?? []).filter(
      (row) => row.reference.toLowerCase().includes(q) || row.concessionnaireId.toLowerCase().includes(q),
    );
  }, [succession, search]);

  function exportAlertsCsv() {
    const lines = ["type,id,reference_or_contrat,retard_jours"];
    for (const row of filteredCautions) {
      lines.push(`CAUTION,${row.id},${row.contratId},${row.daysOverdue}`);
    }
    for (const row of filteredSuccession) {
      lines.push(`SUCCESSION,${row.id},${row.reference},${row.daysInactive}`);
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lonaci-alertes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="space-y-5" aria-live="polite" aria-busy="true">
        <PageHeader
          eyebrow="Pilotage des risques"
          title="Toutes les alertes"
          description="Chargement de la vue consolidée…"
        />
        <Surface padding="lg">
          <Skeleton lines={5} />
        </Surface>
      </div>
    );
  }

  if (error) {
    return (
      <FeedbackState
        tone="danger"
        title="Alertes indisponibles"
        description={error}
        aria-live="assertive"
        action={
          <Button leadingIcon={RefreshCw} onClick={() => void loadAlerts()}>
            Réessayer
          </Button>
        }
      />
    );
  }

  const dv = kpi?.dossierValidation;
  const daily = kpi?.daily;

  return (
    <div className="space-y-6" aria-live="polite">
      <PageHeader
        eyebrow="Pilotage des risques"
        title="Toutes les alertes"
        description="Indicateurs critiques et listes détaillées, affichés selon vos droits d’accès."
        actions={
          <>
            <Button variant="secondary" leadingIcon={RefreshCw} onClick={() => void loadAlerts()}>
              Rafraîchir
            </Button>
            <Button leadingIcon={Download} onClick={exportAlertsCsv}>
              Export CSV
            </Button>
          </>
        }
      />

      <FilterBar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Référence, contrat ou identifiant…",
          label: "Rechercher dans les alertes",
        }}
        filters={
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
            Seuil retard min (jours)
            <input
              type="number"
              min={0}
              value={minDays}
              onChange={(e) => setMinDays(Math.max(0, Number(e.target.value || 0)))}
              className="w-16 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
            />
          </label>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpi?.workflowQueues.dossiers != null ? (
          <AlertCard
            title="Votre file dossiers"
            value={kpi.workflowQueues.dossiers}
            subtitle={`${dv?.contratSoumisRetard48h ?? 0} sans traitement > 48h`}
            href="/dossiers"
            tone="info"
          />
        ) : null}
        {kpi?.workflowQueues.cautions != null ? (
          <AlertCard
            title="Votre file cautions"
            value={kpi.workflowQueues.cautions}
            subtitle={`${dv?.cautionsJ10 ?? 0} en retard J+10`}
            href="/cautions"
            tone="warning"
          />
        ) : null}
        <AlertCard
          title="Géolocalisation PDV — dossiers non finalisés"
          value={daily?.pdvIntegrations?.nonFinalise ?? 0}
          subtitle={`${dv?.pdvEnCoursRetard5j ?? 0} en cours > 5 j.`}
          href="/pdv-integrations"
          tone="brand"
        />
        {kpi?.workflowQueues.agrements != null ? (
          <AlertCard
            title="Votre file agréments"
            value={kpi.workflowQueues.agrements}
            subtitle={`${dv?.agrementsRetard ?? 0} sans mise à jour > 7 j.`}
            href="/agrements"
            tone="success"
          />
        ) : null}
        {kpi?.workflowQueues.successions != null ? (
          <AlertCard
            title="Votre file successions"
            value={kpi.workflowQueues.successions}
            subtitle={`${dv?.successionStale30j ?? 0} sans avance > 30 j.`}
            href="/succession"
            tone="danger"
          />
        ) : null}
        {kpi?.workflowQueues.bancarisation != null ? (
          <AlertCard
            title="Votre file bancarisation"
            value={kpi.workflowQueues.bancarisation}
            subtitle={`Taux bancarisés : ${kpi.bancarisation.tauxBancarisation}%`}
            href="/bancarisation"
            tone="neutral"
          />
        ) : null}
      </div>

      {filteredCautions.length > 0 ? (
        <Surface padding="md">
          <SectionHeader
            title="Cautions dépassées"
            description="Échéances ayant franchi le seuil sélectionné."
            action={<Badge tone="warning">{filteredCautions.length} résultat(s)</Badge>}
          />
          <ul className="mt-2 space-y-2 text-sm">
            {filteredCautions.slice(0, 30).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-2 text-slate-700 last:border-0">
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
        </Surface>
      ) : null}

      {filteredSuccession.length > 0 ? (
        <Surface padding="md">
          <SectionHeader
            title="Successions sans avancement"
            description="Dossiers inactifs au-delà du seuil sélectionné."
            action={<Badge tone="danger">{filteredSuccession.length} résultat(s)</Badge>}
          />
          <ul className="mt-2 space-y-2 text-sm">
            {filteredSuccession.slice(0, 30).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-2 text-slate-700 last:border-0">
                <span>
                  {s.reference} — inactif depuis {s.daysInactive} j.
                </span>
                <Link href="/succession" className="text-xs font-medium text-rose-700 hover:underline">
                  Ouvrir succession
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      {filteredCautions.length === 0 && filteredSuccession.length === 0 ? (
        <FeedbackState
          title="Aucune alerte détaillée"
          description="Aucune caution ni succession ne correspond aux filtres actifs."
        />
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
  tone: "neutral" | "brand" | "info" | "success" | "warning" | "danger";
}) {
  const Icon = tone === "brand" ? MapPin : tone === "danger" || tone === "warning" ? AlertTriangle : ShieldAlert;
  return (
    <Link
      href={href}
      className="block rounded-xl focus-visible:outline-none"
    >
      <Surface className="h-full transition hover:-translate-y-0.5 hover:shadow-md" padding="md">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
          <Badge tone={tone}>
            <Icon size={14} aria-hidden="true" />
            Alerte
          </Badge>
        </div>
        <p className="mt-4 text-3xl font-extrabold tracking-tight text-(--lonaci-navy-950)">{value}</p>
        <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
      </Surface>
    </Link>
  );
}
