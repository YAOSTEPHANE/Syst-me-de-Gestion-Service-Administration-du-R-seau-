"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type PdvStatus = "DEMANDE_RECUE" | "EN_TRAITEMENT" | "INTEGRE_GPR" | "FINALISE";

interface AgenceRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

interface ProduitRef {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

interface PdvItem {
  id: string;
  reference: string;
  codePdv: string;
  concessionnaireId: string | null;
  raisonSociale: string;
  agenceId: string | null;
  produitCode: string;
  nombreDemandes: number;
  dateDemande: string;
  gps: { lat: number; lng: number };
  observations: string | null;
  status: PdvStatus;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: PdvItem[];
  dashboard?: {
    byAgenceEnTraitement: Array<{ agenceId: string | null; count: number }>;
    staleProcessingCount: number;
  };
  total: number;
  page: number;
  pageSize: number;
}

async function fetchList(input: {
  page: number;
  pageSize: number;
  agenceId?: string;
  produitCode?: string;
  status?: PdvStatus;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ListResponse> {
  const search = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  if (input.agenceId) search.set("agenceId", input.agenceId);
  if (input.produitCode) search.set("produitCode", input.produitCode);
  if (input.status) search.set("status", input.status);
  if (input.dateFrom) search.set("dateFrom", new Date(`${input.dateFrom}T00:00:00`).toISOString());
  if (input.dateTo) search.set("dateTo", new Date(`${input.dateTo}T23:59:59.999`).toISOString());
  const response = await fetch(`/api/pdv-integrations?${search}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les intégrations PDV");
  }
  return response.json();
}

function statusClass(status: PdvStatus): string {
  switch (status) {
    case "FINALISE":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "INTEGRE_GPR":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "DEMANDE_RECUE":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "EN_TRAITEMENT":
      return "border-sky-200 bg-sky-50 text-sky-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

export default function PdvIntegrationsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [items, setItems] = useState<PdvItem[]>([]);
  const [dashboard, setDashboard] = useState<ListResponse["dashboard"] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [filterAgenceId, setFilterAgenceId] = useState("");
  const [filterProduit, setFilterProduit] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | PdvStatus>("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [agences, setAgences] = useState<AgenceRef[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  const [agenceId, setAgenceId] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const [nombreDemandes, setNombreDemandes] = useState("1");
  const [dateDemande, setDateDemande] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [observations, setObservations] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [finalizeModal, setFinalizeModal] = useState<PdvItem | null>(null);
  const [finalizeAck, setFinalizeAck] = useState(false);

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] leading-4 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400";

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchList({
        page: nextPage,
        pageSize,
        agenceId: filterAgenceId.trim() || undefined,
        produitCode: filterProduit.trim() || undefined,
        status: filterStatus || undefined,
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined,
      });
      setItems(data.items);
      setDashboard(data.dashboard ?? null);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAgenceId, filterProduit, filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    setRefLoading(true);
    setRefError(null);
    void (async () => {
      try {
        const res = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("Référentiels indisponibles");
        const data = (await res.json()) as { agences: AgenceRef[]; produits: ProduitRef[] };
        if (!cancelled) {
          setAgences((data.agences ?? []).filter((a) => a.actif));
          setProduits((data.produits ?? []).filter((p) => p.actif));
        }
      } catch (e) {
        if (!cancelled) setRefError(e instanceof Error ? e.message : "Erreur");
      } finally {
        if (!cancelled) setRefLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateFormError(null);
    setCreating(true);
    setError(null);
    try {
      const latN = Number(lat);
      const lngN = Number(lng);
      if (Number.isNaN(latN) || Number.isNaN(lngN)) {
        throw new Error("GPS lat/lng invalides");
      }
      const response = await fetch("/api/pdv-integrations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agenceId: agenceId.trim() ? agenceId.trim() : null,
          produitCode: produitCode.trim().toUpperCase(),
          nombreDemandes: Number(nombreDemandes),
          dateDemande: new Date(dateDemande).toISOString(),
          gps: { lat: latN, lng: lngN },
          observations: observations.trim() ? observations.trim() : null,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Création impossible");
      }
      setAgenceId("");
      setProduitCode("");
      setNombreDemandes("1");
      setDateDemande("");
      setLat("");
      setLng("");
      setObservations("");
      setCreateOpen(false);
      await load(1);
      setToast({ type: "success", message: "Intégration PDV créée." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur";
      setCreateFormError(message);
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setCreating(false);
    }
  }

  function openCreate() {
    setCreateFormError(null);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setDateDemande(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T12:00`);
    setCreateOpen(true);
  }

  function closeCreate() {
    if (creating) return;
    setCreateOpen(false);
    setCreateFormError(null);
  }

  function openFinalizeModal(row: PdvItem) {
    setFinalizeModal(row);
    setFinalizeAck(false);
  }

  function closeFinalizeModal() {
    if (finalizingId) return;
    setFinalizeModal(null);
    setFinalizeAck(false);
  }

  async function finalizeIntegration(id: string) {
    setFinalizingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/pdv-integrations/${encodeURIComponent(id)}/finalize`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Finalisation impossible");
      }
      await load(page);
      closeFinalizeModal();
      setToast({ type: "success", message: "Intégration PDV finalisée." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setFinalizingId(null);
    }
  }

  async function transitionIntegration(id: string, targetStatus: "EN_TRAITEMENT" | "INTEGRE_GPR" | "FINALISE") {
    if (targetStatus === "FINALISE") {
      const row = items.find((x) => x.id === id);
      if (row) openFinalizeModal(row);
      return;
    }
    setFinalizingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/pdv-integrations/${encodeURIComponent(id)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Transition impossible");
      }
      await load(page);
      setToast({ type: "success", message: "Transition de statut effectuée." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setFinalizingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const analytics = useMemo(() => {
    const status = { demandeRecue: 0, enTraitement: 0, integreGpr: 0, finalise: 0 };
    const byAgence = new Map<string, number>();
    const byDay = new Map<string, number>();
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    let avgLatencyDays = 0;
    let finalizedCount = 0;

    for (const row of items) {
      if (row.status === "DEMANDE_RECUE") status.demandeRecue += 1;
      else if (row.status === "EN_TRAITEMENT") status.enTraitement += 1;
      else if (row.status === "INTEGRE_GPR") status.integreGpr += 1;
      else status.finalise += 1;

      const agenceKey = row.agenceId ?? "Non rattachée";
      byAgence.set(agenceKey, (byAgence.get(agenceKey) ?? 0) + 1);

      const created = new Date(row.createdAt);
      if (!Number.isNaN(created.getTime()) && now - created.getTime() <= sevenDaysMs) {
        const dayKey = created.toISOString().slice(0, 10);
        byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
      }

      if (row.finalizedAt) {
        const finalized = new Date(row.finalizedAt);
        if (!Number.isNaN(finalized.getTime()) && !Number.isNaN(created.getTime()) && finalized > created) {
          avgLatencyDays += (finalized.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          finalizedCount += 1;
        }
      }
    }

    const pipelineTotal = status.demandeRecue + status.enTraitement + status.integreGpr;
    const volumeTotal = status.demandeRecue + status.enTraitement + status.integreGpr + status.finalise;
    const finalRate = volumeTotal > 0 ? Math.round((status.finalise / volumeTotal) * 100) : 0;
    const avgFinalizeDays = finalizedCount > 0 ? (avgLatencyDays / finalizedCount).toFixed(1) : "—";

    const agencies = [...byAgence.entries()]
      .map(([agence, count]) => ({ agence, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const trendPoints = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, count]) => count);
    const maxTrend = trendPoints.length ? Math.max(...trendPoints) : 0;
    const sparkline = trendPoints
      .map((value, index) => {
        const x = trendPoints.length === 1 ? 0 : (index / (trendPoints.length - 1)) * 100;
        const y = maxTrend <= 0 ? 50 : 100 - (value / maxTrend) * 100;
        return `${x},${y}`;
      })
      .join(" ");

    return {
      ...status,
      pipelineTotal,
      volumeTotal,
      finalRate,
      avgFinalizeDays,
      agencies,
      sparkline,
    };
  }, [items]);

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-r from-slate-900 via-slate-800 to-violet-900 p-5 shadow-sm">
        <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-violet-300/20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-24 h-44 w-44 rounded-full bg-indigo-300/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-100">
              Référentiel
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Intégrations PDV</h2>
            <p className="mt-1 text-sm text-violet-100/90">
              Pilotage des demandes d’intégration et progression du workflow opérationnel.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load(page)}
            className="rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Actualiser
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-xl border border-violet-300 bg-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-violet-200 hover:bg-violet-400"
          >
            Créer Intégration PDV
          </button>
          <a
            href={`/api/pdv-integrations/export?format=excel&agenceId=${encodeURIComponent(filterAgenceId)}&produitCode=${encodeURIComponent(filterProduit)}&status=${encodeURIComponent(filterStatus)}${filterDateFrom ? `&dateFrom=${encodeURIComponent(new Date(`${filterDateFrom}T00:00:00`).toISOString())}` : ""}${filterDateTo ? `&dateTo=${encodeURIComponent(new Date(`${filterDateTo}T23:59:59.999`).toISOString())}` : ""}`}
            className="rounded-xl border border-emerald-300 bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Export Excel
          </a>
          <a
            href={`/api/pdv-integrations/export?format=pdf&agenceId=${encodeURIComponent(filterAgenceId)}&produitCode=${encodeURIComponent(filterProduit)}&status=${encodeURIComponent(filterStatus)}${filterDateFrom ? `&dateFrom=${encodeURIComponent(new Date(`${filterDateFrom}T00:00:00`).toISOString())}` : ""}${filterDateTo ? `&dateTo=${encodeURIComponent(new Date(`${filterDateTo}T23:59:59.999`).toISOString())}` : ""}`}
            className="rounded-xl border border-rose-300 bg-rose-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
          >
            Export PDF
          </a>
        </div>
        </div>
      </header>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-violet-50/40 p-3 sm:grid-cols-5">
        <input
          value={filterAgenceId}
          onChange={(e) => setFilterAgenceId(e.target.value)}
          placeholder="Filtre agence"
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 shadow-sm"
        />
        <input
          value={filterProduit}
          onChange={(e) => setFilterProduit(e.target.value)}
          placeholder="Filtre produit"
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 shadow-sm"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "" | PdvStatus)}
          aria-label="Filtrer par statut"
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 shadow-sm"
        >
          <option value="">Tous statuts</option>
          <option value="DEMANDE_RECUE">DEMANDE_RECUE</option>
          <option value="EN_TRAITEMENT">EN_TRAITEMENT</option>
          <option value="INTEGRE_GPR">INTEGRE_GPR</option>
          <option value="FINALISE">FINALISE</option>
        </select>
        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          aria-label="Filtrer date demande début"
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 shadow-sm"
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          aria-label="Filtrer date demande fin"
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 shadow-sm"
        />
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Analytics PDV</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Vue avancée du pipeline d’intégration, de la finalisation et de la charge agence.
          </p>
        </div>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-linear-to-br from-slate-50 to-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-600">Volume visible</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{analytics.volumeTotal}</div>
            <div className="text-[11px] text-slate-500">Lignes chargées</div>
          </div>
          <div className="rounded-xl border border-sky-100 bg-linear-to-br from-sky-50 to-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-sky-700">Pipeline actif</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{analytics.pipelineTotal}</div>
            <div className="text-[11px] text-slate-500">Demande reçue + Traitement + Intégré GPR</div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-linear-to-br from-emerald-50 to-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-emerald-700">Taux finalisé</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{analytics.finalRate}%</div>
            <div className="text-[11px] text-slate-500">Sur les éléments visibles</div>
          </div>
          <div className="rounded-xl border border-violet-100 bg-linear-to-br from-violet-50 to-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-violet-700">Cycle moyen</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{analytics.avgFinalizeDays}</div>
            <div className="text-[11px] text-slate-500">Jours jusqu’à finalisation</div>
          </div>
          <div className="rounded-xl border border-rose-100 bg-linear-to-br from-rose-50 to-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-rose-700">Alertes &gt; 5 jours</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{dashboard?.staleProcessingCount ?? 0}</div>
            <div className="text-[11px] text-slate-500">Demandes bloquées en EN_TRAITEMENT</div>
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-12">
          <div className="rounded-xl border border-slate-200 p-3 lg:col-span-4">
            <div className="text-xs font-semibold text-slate-900">Répartition statuts</div>
            <div className="mt-3 space-y-2 text-[11px]">
              {[
                { label: "Demande reçue", value: analytics.demandeRecue, tone: "bg-amber-500" },
                { label: "En traitement", value: analytics.enTraitement, tone: "bg-sky-500" },
                { label: "Intégré GPR", value: analytics.integreGpr, tone: "bg-violet-500" },
                { label: "Finalisé", value: analytics.finalise, tone: "bg-emerald-500" },
              ].map((row) => {
                const pct = analytics.volumeTotal > 0 ? Math.round((row.value / analytics.volumeTotal) * 100) : 0;
                return (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-slate-600">
                      <span>{row.label}</span>
                      <span>
                        {row.value} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <progress
                        className={`h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-slate-100 ${
                          row.tone === "bg-amber-500"
                            ? "[&::-webkit-progress-value]:bg-amber-500"
                            : row.tone === "bg-sky-500"
                              ? "[&::-webkit-progress-value]:bg-sky-500"
                              : row.tone === "bg-violet-500"
                                ? "[&::-webkit-progress-value]:bg-violet-500"
                                : "[&::-webkit-progress-value]:bg-emerald-500"
                        }`}
                        max={100}
                        value={pct}
                        aria-label={`Part ${row.label}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 lg:col-span-4">
            <div className="text-xs font-semibold text-slate-900">Momentum création (7 jours)</div>
            <div className="mt-1 text-[11px] text-slate-600">Tendance des intégrations récentes</div>
            <div className="mt-3 h-24 rounded-lg bg-slate-50 p-2">
              {analytics.sparkline ? (
                <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth="2.5"
                    points={analytics.sparkline}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <p className="text-xs text-slate-500">Pas assez de données récentes.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 lg:col-span-4">
            <div className="text-xs font-semibold text-slate-900">Demandes en cours par agence</div>
            <div className="mt-2 space-y-2">
              {dashboard?.byAgenceEnTraitement?.length ? (
                dashboard.byAgenceEnTraitement.map((row) => (
                  <div
                    key={`${row.agenceId ?? "none"}-${row.count}`}
                    className="rounded-md bg-violet-50/70 px-2 py-1.5 text-[11px] text-violet-900"
                  >
                    <div className="font-mono">{row.agenceId ?? "Non rattachée"}</div>
                    <div>{row.count} intégration(s)</div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">Aucune demande en traitement.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-pdv-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60"
            aria-label="Fermer"
            disabled={creating}
            onClick={closeCreate}
          />
          <div className="relative z-10 flex max-h-[78vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="relative flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-4 py-3">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-200/40 blur-2xl" />
              <div>
                <p className="mb-1 inline-flex rounded-full border border-violet-300 bg-violet-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900">
                  Intégration PDV
                </p>
                <h3 id="create-pdv-title" className="text-lg font-semibold text-slate-900">
                  Créer Intégration PDV
                </h3>
                <p className="mt-1 text-xs leading-4 text-slate-600">
                  Renseignez les informations minimales pour initier l’intégration du point de vente.
                </p>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={closeCreate}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/80 via-white to-white px-4 py-3">
              {refError ? <p className="mb-2 text-xs text-rose-700">{refError}</p> : null}
              <form onSubmit={onCreate} className="grid gap-2.5">
                <section className="rounded-xl border border-violet-200/80 bg-white p-3 shadow-sm">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                    Paramètres opérationnels
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Agence concernée</span>
                  <select
                    value={agenceId}
                    onChange={(e) => setAgenceId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                    disabled={refLoading}
                  >
                    <option value="">{refLoading ? "Chargement…" : "Aucune agence"}</option>
                    {agences
                      .slice()
                      .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.libelle}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Produit concerné *</span>
                  <select
                    required
                    value={produitCode}
                    onChange={(e) => setProduitCode(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                    disabled={refLoading}
                  >
                    <option value="">{refLoading ? "Chargement…" : "Sélectionner un produit"}</option>
                    {produits
                      .slice()
                      .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" }))
                      .map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.libelle}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Nombre de demandes *</span>
                  <input
                    required
                    type="number"
                    min={1}
                    step={1}
                    value={nombreDemandes}
                    onChange={(e) => setNombreDemandes(e.target.value)}
                    placeholder="Ex: 1"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Date de la demande *</span>
                  <input
                    required
                    type="datetime-local"
                    value={dateDemande}
                    onChange={(e) => setDateDemande(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </label>
                </div>
                </section>

                <section className="rounded-xl border border-indigo-200/80 bg-white p-3 shadow-sm">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
                    Localisation et contexte
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Latitude *</span>
                  <input
                    required
                    type="number"
                    step="any"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="Ex: 5.32"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-slate-700">Longitude *</span>
                  <input
                    required
                    type="number"
                    step="any"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="Ex: -4.03"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </label>
                <label className="grid gap-1 sm:col-span-2">
                  <span className="text-xs font-medium text-slate-700">Observations</span>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Zone observations"
                    rows={3}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400"
                  />
                </label>
                  </div>
                </section>

                <div>
                  {createFormError ? (
                    <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                      {createFormError}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={closeCreate}
                      disabled={creating}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="rounded-lg border border-violet-700 bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
                    >
                      {creating ? "Création..." : "Créer intégration PDV"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Chargement...</p> : null}
      {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
      {toast ? (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} className="text-xs opacity-80 hover:opacity-100">
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>
              {total} enregistrement(s) · page {page}/{totalPages}
            </span>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => void load(page - 1)}
              className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => void load(page + 1)}
              className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-2">Réf</th>
                  <th className="px-2 py-2">Code PDV</th>
                  <th className="px-2 py-2">Produit</th>
                  <th className="px-2 py-2">Nb demandes</th>
                  <th className="px-2 py-2">Date demande</th>
                  <th className="px-2 py-2">Statut</th>
                  <th className="px-2 py-2">Concessionnaire</th>
                  <th className="px-2 py-2">Créé</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="text-slate-900">
                {items.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                    <td className="px-2 py-2 font-mono text-xs">{row.reference}</td>
                    <td className="px-2 py-2">{row.codePdv}</td>
                    <td className="px-2 py-2">{row.produitCode}</td>
                    <td className="px-2 py-2">{row.nombreDemandes}</td>
                    <td className="px-2 py-2 text-xs">{new Date(row.dateDemande).toLocaleString("fr-FR")}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{row.concessionnaireId ?? "—"}</td>
                    <td className="px-2 py-2 text-xs">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-2 py-2">
                      {row.status === "DEMANDE_RECUE" ? (
                        <button
                          type="button"
                          disabled={finalizingId === row.id}
                          onClick={() => void transitionIntegration(row.id, "EN_TRAITEMENT")}
                          className="rounded-lg border border-sky-200 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                        >
                          {finalizingId === row.id ? "…" : "Passer en traitement"}
                        </button>
                      ) : row.status === "EN_TRAITEMENT" ? (
                        <button
                          type="button"
                          disabled={finalizingId === row.id}
                          onClick={() => void transitionIntegration(row.id, "INTEGRE_GPR")}
                          className="rounded-lg border border-violet-200 px-2 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                        >
                          {finalizingId === row.id ? "…" : "Marquer intégré GPR"}
                        </button>
                      ) : row.status === "INTEGRE_GPR" ? (
                        <button
                          type="button"
                          disabled={finalizingId === row.id}
                          onClick={() => void transitionIntegration(row.id, "FINALISE")}
                          className="rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {finalizingId === row.id ? "…" : "Finaliser"}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!items.length ? (
                  <tr>
                    <td className="px-2 py-4 text-slate-500" colSpan={9}>
                      Aucune intégration PDV.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </div>
        </>
      ) : null}

      {finalizeModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finalize-pdv-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60"
            aria-label="Fermer"
            disabled={finalizingId !== null}
            onClick={closeFinalizeModal}
          />
          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="relative flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-5 py-4">
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-200/40 blur-2xl" />
              <div>
                <h3 id="finalize-pdv-title" className="text-lg font-semibold text-slate-900">
                  Validation finale intégration PDV
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Cette action finalise l’intégration et peut créer/lier automatiquement un concessionnaire.
                </p>
              </div>
              <button
                type="button"
                disabled={finalizingId !== null}
                onClick={closeFinalizeModal}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="p-5">

            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Action sensible et potentiellement irréversible. Vérifiez les données avant confirmation.
            </div>

            <dl className="mt-4 grid gap-2 text-sm text-slate-800">
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">Référence</dt>
                <dd className="font-mono text-xs">{finalizeModal.reference}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">Code PDV</dt>
                <dd className="font-mono text-xs">{finalizeModal.codePdv}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">Raison sociale</dt>
                <dd>{finalizeModal.raisonSociale}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">Agence</dt>
                <dd className="font-mono text-xs">{finalizeModal.agenceId ?? "Non rattachée"}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">GPS</dt>
                <dd className="font-mono text-xs">
                  {finalizeModal.gps.lat}, {finalizeModal.gps.lng}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 py-1.5">
                <dt className="text-slate-500">Statut actuel</dt>
                <dd>{finalizeModal.status}</dd>
              </div>
            </dl>

            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={finalizeAck}
                onChange={(e) => setFinalizeAck(e.target.checked)}
                disabled={finalizingId !== null}
                className="mt-0.5 rounded border-slate-300"
              />
              <span>Je confirme avoir vérifié les informations et autorise la finalisation.</span>
            </label>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={finalizingId !== null}
                onClick={closeFinalizeModal}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!finalizeAck || finalizingId !== null}
                onClick={() => void finalizeIntegration(finalizeModal.id)}
                className="rounded-lg border border-violet-700 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {finalizingId === finalizeModal.id ? "Finalisation..." : "Confirmer la finalisation"}
              </button>
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
