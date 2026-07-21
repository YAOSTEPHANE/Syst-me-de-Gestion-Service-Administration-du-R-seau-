"use client";

import { useEffect, useState } from "react";
import { BellRing, CircleCheck, TriangleAlert } from "lucide-react";

import { StatusBadge } from "@/components/lonaci/ui/badge";
import { FeedbackState, Skeleton } from "@/components/lonaci/ui/feedback-state";
import { SectionHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";

type HealthSummary = {
  open: number;
  ack: number;
};

export default function AdminOperationalAlertsPanel() {
  const [summary, setSummary] = useState<HealthSummary>({ open: 0, ack: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setError(null);
        const res = await fetch("/api/monitoring/events?page=1&pageSize=50", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Impossible de charger les alertes opérationnelles.");
        const data = (await res.json()) as { items?: Array<{ status?: "OPEN" | "ACK" }> };
        const items = data.items ?? [];
        setSummary({
          open: items.filter((item) => item.status === "OPEN").length,
          ack: items.filter((item) => item.status === "ACK").length,
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Chargement impossible.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Surface elevated aria-labelledby="operational-alerts-title">
      <SectionHeader
        title={<span id="operational-alerts-title" className="inline-flex items-center gap-2"><BellRing size={19} className="text-orange-600" aria-hidden="true" />Alertes opérationnelles</span>}
        description="Vue synthétique des 50 incidents critiques les plus récents."
        action={!loading && !error ? <StatusBadge tone={summary.open > 0 ? "warning" : "success"}>{summary.open > 0 ? "Attention requise" : "Situation nominale"}</StatusBadge> : undefined}
      />
      <div className="mt-5" aria-live="polite" aria-busy={loading}>
        {loading ? <Skeleton lines={3} /> : null}
        {error ? <FeedbackState tone="danger" title="Alertes indisponibles" description={error} /> : null}
        {!loading && !error ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
              <TriangleAlert size={20} className="text-orange-600" aria-hidden="true" />
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-orange-700">Ouvertes</p>
              <p className="mt-1 text-3xl font-black text-[#13213c]">{summary.open}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <CircleCheck size={20} className="text-emerald-600" aria-hidden="true" />
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Traitées</p>
              <p className="mt-1 text-3xl font-black text-[#13213c]">{summary.ack}</p>
            </article>
          </div>
        ) : null}
      </div>
    </Surface>
  );
}
