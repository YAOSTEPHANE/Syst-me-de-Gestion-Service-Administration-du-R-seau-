"use client";

import { useEffect, useState } from "react";

type HealthSummary = {
  open: number;
  ack: number;
};

export default function AdminOperationalAlertsPanel() {
  const [summary, setSummary] = useState<HealthSummary>({ open: 0, ack: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/monitoring/events?page=1&pageSize=50", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { items?: Array<{ status?: "OPEN" | "ACK" }> };
        const items = data.items ?? [];
        setSummary({
          open: items.filter((item) => item.status === "OPEN").length,
          ack: items.filter((item) => item.status === "ACK").length,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Alertes opérationnelles</h3>
      <p className="mt-1 text-xs text-slate-600">Vue synthétique des incidents critiques récents.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-amber-700">Ouvertes</p>
          <p className="mt-1 text-lg font-semibold text-amber-900">{loading ? "..." : summary.open}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-emerald-700">Traitées</p>
          <p className="mt-1 text-lg font-semibold text-emerald-900">{loading ? "..." : summary.ack}</p>
        </div>
      </div>
    </section>
  );
}
