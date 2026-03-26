"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type RefProduit = { code: string; libelle: string; actif: boolean };
type RefConcessionnaire = { id: string; codePdv: string; raisonSociale: string };

type GprStatus = "SOUMIS_AGENT" | "VALIDE_N1" | "VALIDE_N2" | "SUIVI_CHEF_SERVICE" | "REJETE";
type ScratchStatus = "GENERE" | "ATTRIBUE" | "ACTIF" | "EPUISE";

type GprItem = {
  id: string;
  reference: string;
  concessionnaireId: string;
  produitsActifs: string[];
  dateEnregistrement: string;
  status: GprStatus;
  sync: {
    state: "PENDING" | "SUCCESS" | "FAILED";
    attempts: number;
    lastError: string | null;
    lastSuccessAt: string | null;
  };
  createdAt: string;
};

type ScratchItem = {
  id: string;
  lotId: string;
  concessionnaireId: string;
  produitCode: string;
  requestedCount: number;
  generatedCount: number;
  status: ScratchStatus;
  createdAt: string;
  history: Array<{ action: string; at: string }>;
};

function gprStatusStyle(status: GprStatus) {
  if (status === "SOUMIS_AGENT") return "border-amber-300 bg-amber-100 text-amber-900";
  if (status === "VALIDE_N1") return "border-sky-300 bg-sky-100 text-sky-900";
  if (status === "VALIDE_N2") return "border-violet-300 bg-violet-100 text-violet-900";
  if (status === "SUIVI_CHEF_SERVICE") return "border-emerald-300 bg-emerald-100 text-emerald-900";
  return "border-rose-300 bg-rose-100 text-rose-900";
}

function scratchStatusStyle(status: ScratchStatus) {
  if (status === "GENERE") return "border-slate-300 bg-slate-100 text-slate-900";
  if (status === "ATTRIBUE") return "border-sky-300 bg-sky-100 text-sky-900";
  if (status === "ACTIF") return "border-emerald-300 bg-emerald-100 text-emerald-900";
  return "border-amber-300 bg-amber-100 text-amber-900";
}

function syncStateStyle(state: "PENDING" | "SUCCESS" | "FAILED") {
  if (state === "SUCCESS") return "border-emerald-300 bg-emerald-100 text-emerald-900";
  if (state === "FAILED") return "border-rose-300 bg-rose-100 text-rose-900";
  return "border-amber-300 bg-amber-100 text-amber-900";
}

export default function GprModulePage() {
  const [produits, setProduits] = useState<RefProduit[]>([]);
  const [concessionnaires, setConcessionnaires] = useState<RefConcessionnaire[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gprItems, setGprItems] = useState<GprItem[]>([]);
  const [gprLogs, setGprLogs] = useState<Array<{ id: string; exportedAt: string; operatorUserId: string; entriesCount: number; generatedFilename: string }>>([]);
  const [scratchItems, setScratchItems] = useState<ScratchItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [gprConcessionnaireId, setGprConcessionnaireId] = useState("");
  const [gprProducts, setGprProducts] = useState<string[]>([]);
  const [gprDate, setGprDate] = useState("");
  const [creatingGpr, setCreatingGpr] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const [lotId, setLotId] = useState("");
  const [lotCodes, setLotCodes] = useState("100");
  const [lotConcessionnaireId, setLotConcessionnaireId] = useState("");
  const [lotProduitCode, setLotProduitCode] = useState("");
  const [creatingLot, setCreatingLot] = useState(false);
  const [createLotOpen, setCreateLotOpen] = useState(false);

  const concessionnaireLabelById = useMemo(
    () => new Map(concessionnaires.map((c) => [c.id, `${c.codePdv} - ${c.raisonSociale}`])),
    [concessionnaires],
  );
  const kpis = useMemo(
    () => ({
      gprTotal: gprItems.length,
      gprEligibleSync: gprItems.filter((x) => ["VALIDE_N2", "SUIVI_CHEF_SERVICE"].includes(x.status)).length,
      gprSyncFailed: gprItems.filter((x) => x.sync.state === "FAILED").length,
      scratchTotal: scratchItems.length,
      scratchActive: scratchItems.filter((x) => x.status === "ACTIF").length,
      scratchExhausted: scratchItems.filter((x) => x.status === "EPUISE").length,
      exports: gprLogs.length,
    }),
    [gprItems, scratchItems, gprLogs],
  );

  async function loadReferentials() {
    setLoadingRef(true);
    try {
      const [refRes, cRes] = await Promise.all([
        fetch("/api/referentials", { credentials: "include", cache: "no-store" }),
        fetch("/api/concessionnaires?page=1&pageSize=100", { credentials: "include", cache: "no-store" }),
      ]);
      if (!refRes.ok || !cRes.ok) throw new Error("Chargement des référentiels impossible");
      const refBody = (await refRes.json()) as { produits: RefProduit[] };
      const cBody = (await cRes.json()) as {
        items: Array<{ id: string; codePdv: string; raisonSociale: string }>;
      };
      setProduits((refBody.produits ?? []).filter((p) => p.actif));
      setConcessionnaires(cBody.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoadingRef(false);
    }
  }

  async function loadData() {
    setLoadingData(true);
    setError(null);
    try {
      const [gprRes, logsRes, scratchRes] = await Promise.all([
        fetch("/api/gpr-registrations?page=1&pageSize=20", { credentials: "include", cache: "no-store" }),
        fetch("/api/gpr-registrations/exports", { credentials: "include", cache: "no-store" }),
        fetch("/api/scratch-codes/lots?page=1&pageSize=20", { credentials: "include", cache: "no-store" }),
      ]);
      if (!gprRes.ok || !logsRes.ok || !scratchRes.ok) throw new Error("Chargement des données impossible");
      const gprBody = (await gprRes.json()) as { items: GprItem[] };
      const logsBody = (await logsRes.json()) as {
        items: Array<{ id: string; exportedAt: string; operatorUserId: string; entriesCount: number; generatedFilename: string }>;
      };
      const scratchBody = (await scratchRes.json()) as { items: ScratchItem[] };
      setGprItems(gprBody.items ?? []);
      setGprLogs(logsBody.items ?? []);
      setScratchItems(scratchBody.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setGprDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T12:00`);
    void loadReferentials();
    void loadData();
  }, []);

  async function onCreateGpr(e: FormEvent) {
    e.preventDefault();
    setCreatingGpr(true);
    setError(null);
    try {
      const response = await fetch("/api/gpr-registrations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concessionnaireId: gprConcessionnaireId,
          produitsActifs: gprProducts,
          dateEnregistrement: new Date(gprDate).toISOString(),
        }),
      });
      if (!response.ok) throw new Error("Création GPR impossible");
      setGprProducts([]);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreatingGpr(false);
    }
  }

  async function onTransitionGpr(id: string, targetStatus: GprStatus) {
    setError(null);
    const comment =
      targetStatus === "REJETE"
        ? window.prompt("Motif du rejet (optionnel)", "")?.trim() || null
        : null;
    const response = await fetch(`/api/gpr-registrations/${encodeURIComponent(id)}/transition`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetStatus, comment }),
    });
    if (!response.ok) {
      setError("Transition GPR refusée (vérifiez votre rôle et l’étape).");
      return;
    }
    await loadData();
  }

  async function onSyncGpr(id: string) {
    setSyncingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/gpr-registrations/${encodeURIComponent(id)}/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Echec de synchronisation GPR");
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSyncingId(null);
    }
  }

  async function onCreateLot(e: FormEvent) {
    e.preventDefault();
    setCreatingLot(true);
    setError(null);
    try {
      const response = await fetch("/api/scratch-codes/lots", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotId,
          nombreCodes: Number(lotCodes),
          concessionnaireId: lotConcessionnaireId,
          produitCode: lotProduitCode,
        }),
      });
      if (!response.ok) throw new Error("Création du lot impossible");
      setLotId("");
      setLotCodes("100");
      setLotConcessionnaireId("");
      setLotProduitCode("");
      setCreateLotOpen(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCreatingLot(false);
    }
  }

  async function onTransitionLot(lot: string, targetStatus: ScratchStatus) {
    setError(null);
    const response = await fetch(`/api/scratch-codes/lots/${encodeURIComponent(lot)}/transition`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetStatus }),
    });
    if (!response.ok) {
      setError("Transition lot refusée (validation Chef(fe) de section requise pour ACTIF).");
      return;
    }
    await loadData();
  }

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-100 via-cyan-50 to-fuchsia-100 p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(99,102,241,0.28),transparent_45%)]" />
        <div className="relative">
          <p className="mb-2 inline-flex items-center rounded-full border border-indigo-300 bg-indigo-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
            Operations Hub
          </p>
          <h2 className="text-xl font-semibold text-slate-900">GPR &amp; Codes grattage</h2>
          <p className="mt-1 text-sm text-slate-700">
            Suivi opérationnel GPR et supervision des traitements en cours.
          </p>
        </div>
      </header>

      {error ? <p className="rounded border border-rose-300 bg-rose-100 px-3 py-2 text-sm text-rose-900">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-blue-700">Dossiers GPR</p>
          <p className="mt-2 text-2xl font-semibold text-blue-900">{kpis.gprTotal}</p>
        </article>
        <article className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-indigo-700">Eligibles sync API</p>
          <p className="mt-2 text-2xl font-semibold text-indigo-900">{kpis.gprEligibleSync}</p>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-emerald-700">Lots actifs</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-900">{kpis.scratchActive}</p>
        </article>
        <article className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-rose-700">Echecs sync / exports</p>
          <p className="mt-2 text-2xl font-semibold text-rose-900">
            {kpis.gprSyncFailed} <span className="text-base text-slate-600">/ {kpis.exports}</span>
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">Enregistrements GPR</h3>
            <p className="text-xs text-slate-600">Registre officiel, workflow de validation et synchronisation directe.</p>
          </div>
          <a
            href="/api/gpr-registrations/export"
            className="rounded-lg border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
          >
            Export CSV GPR
          </a>
        </div>
        <form onSubmit={onCreateGpr} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <select
            required
            value={gprConcessionnaireId}
            onChange={(e) => setGprConcessionnaireId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
            disabled={loadingRef}
          >
            <option value="">Concessionnaire</option>
            {concessionnaires.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codePdv} - {c.raisonSociale}
              </option>
            ))}
          </select>
          <select
            multiple
            required
            value={gprProducts}
            onChange={(e) => setGprProducts(Array.from(e.target.selectedOptions).map((o) => o.value))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
            disabled={loadingRef}
          >
            {produits.map((p) => (
              <option key={p.code} value={p.code}>
                {p.libelle}
              </option>
            ))}
          </select>
          <input
            required
            type="datetime-local"
            value={gprDate}
            onChange={(e) => setGprDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
          />
          <button
            type="submit"
            disabled={creatingGpr || loadingRef}
            className="rounded-lg border border-indigo-300 bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {creatingGpr ? "Enregistrement..." : "Créer enregistrement GPR"}
          </button>
        </form>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-700">
                <th className="px-3 py-3">Réf.</th>
                <th className="px-3 py-3">Concessionnaire</th>
                <th className="px-3 py-3">Produits</th>
                <th className="px-3 py-3">Date enr.</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3">Sync API</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="text-slate-900">
              {gprItems.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 bg-white last:border-0">
                  <td className="px-3 py-2.5 font-mono text-[11px]">{row.reference}</td>
                  <td className="px-3 py-2.5">{concessionnaireLabelById.get(row.concessionnaireId) ?? row.concessionnaireId}</td>
                  <td className="px-3 py-2.5">{row.produitsActifs.join(", ")}</td>
                  <td className="px-3 py-2.5">{new Date(row.dateEnregistrement).toLocaleString("fr-FR")}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${gprStatusStyle(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${syncStateStyle(row.sync.state)}`}>
                        {row.sync.state}
                      </span>
                      {["VALIDE_N2", "SUIVI_CHEF_SERVICE"].includes(row.status) ? (
                        <button
                          type="button"
                          onClick={() => void onSyncGpr(row.id)}
                          disabled={syncingId === row.id}
                          className="rounded-lg border border-emerald-300 bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {syncingId === row.id ? "Sync..." : "Synchroniser API"}
                        </button>
                      ) : null}
                    </div>
                    {row.sync.lastError ? <p className="mt-1 text-[10px] text-rose-700">{row.sync.lastError}</p> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    {["SOUMIS_AGENT", "VALIDE_N1", "VALIDE_N2"].includes(row.status) ? (
                      <div className="flex flex-wrap gap-1">
                        {row.status === "SOUMIS_AGENT" ? (
                          <button type="button" onClick={() => void onTransitionGpr(row.id, "VALIDE_N1")} className="rounded-lg border border-sky-300 bg-sky-600 px-2 py-1 text-[11px] font-medium text-white">
                            Valider N1
                          </button>
                        ) : row.status === "VALIDE_N1" ? (
                          <button type="button" onClick={() => void onTransitionGpr(row.id, "VALIDE_N2")} className="rounded-lg border border-violet-300 bg-violet-600 px-2 py-1 text-[11px] font-medium text-white">
                            Valider N2
                          </button>
                        ) : (
                          <button type="button" onClick={() => void onTransitionGpr(row.id, "SUIVI_CHEF_SERVICE")} className="rounded-lg border border-emerald-300 bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white">
                            Passer au suivi
                          </button>
                        )}
                        <button type="button" onClick={() => void onTransitionGpr(row.id, "REJETE")} className="rounded-lg border border-rose-300 bg-rose-600 px-2 py-1 text-[11px] font-medium text-white">
                          Rejeter
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">Codes grattage</h3>
            <p className="text-xs text-slate-600">Création, attribution, activation avec validation N1 et export par lot.</p>
          </div>
          <button
            type="button"
            onClick={() => setCreateLotOpen(true)}
            className="rounded-lg border border-indigo-300 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
          >
            Nouveau lot
          </button>
        </div>
        {createLotOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-lot-title">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/60"
              aria-label="Fermer"
              onClick={() => !creatingLot && setCreateLotOpen(false)}
              disabled={creatingLot}
            />
            <div className="relative z-10 flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-fuchsia-50 px-4 py-2">
                <div>
                  <h3 id="create-lot-title" className="text-sm font-semibold text-slate-900">
                    Créer un lot de codes grattage
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                    Identifiant, volume de codes, concessionnaire cible et produit.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !creatingLot && setCreateLotOpen(false)}
                  disabled={creatingLot}
                  className="rounded-lg border border-slate-300 px-2 py-0.5 text-sm text-slate-600"
                >
                  ×
                </button>
              </div>
              <form id="create-scratch-lot-form" onSubmit={onCreateLot} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="grid gap-3">
                  <section className="grid gap-2 rounded-xl border border-indigo-200/70 bg-indigo-50/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Informations lot</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-700">Identifiant lot *</span>
                        <input
                          required
                          value={lotId}
                          onChange={(e) => setLotId(e.target.value)}
                          placeholder="Ex: LOT-GR-2026-03-001"
                          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-slate-700">Nombre de codes *</span>
                        <input
                          required
                          type="number"
                          min={1}
                          value={lotCodes}
                          onChange={(e) => setLotCodes(e.target.value)}
                          placeholder="Nb codes"
                          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
                        />
                      </label>
                    </div>
                  </section>
                  <section className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Concessionnaire *</span>
                      <select
                        required
                        value={lotConcessionnaireId}
                        onChange={(e) => setLotConcessionnaireId(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
                        disabled={loadingRef}
                      >
                        <option value="">Concessionnaire</option>
                        {concessionnaires.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.codePdv} - {c.raisonSociale}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-slate-700">Produit *</span>
                      <select
                        required
                        value={lotProduitCode}
                        onChange={(e) => setLotProduitCode(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900 outline-none ring-indigo-400/40 transition focus:ring-2"
                        disabled={loadingRef}
                      >
                        <option value="">Produit</option>
                        {produits.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.libelle}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>
                </div>
              </form>
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2">
                <button
                  type="button"
                  onClick={() => setCreateLotOpen(false)}
                  disabled={creatingLot}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  form="create-scratch-lot-form"
                  disabled={creatingLot || loadingRef}
                  className="rounded-lg border border-indigo-300 bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creatingLot ? "Génération..." : "Créer lot"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-700">
                <th className="px-3 py-3">Lot</th>
                <th className="px-3 py-3">Concessionnaire</th>
                <th className="px-3 py-3">Produit</th>
                <th className="px-3 py-3">Codes</th>
                <th className="px-3 py-3">Statut</th>
                <th className="px-3 py-3">Historique</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Export</th>
              </tr>
            </thead>
            <tbody className="text-slate-900">
              {scratchItems.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 bg-white last:border-0">
                  <td className="px-3 py-2.5 font-mono text-[11px]">{row.lotId}</td>
                  <td className="px-3 py-2.5">{concessionnaireLabelById.get(row.concessionnaireId) ?? row.concessionnaireId}</td>
                  <td className="px-3 py-2.5">{row.produitCode}</td>
                  <td className="px-3 py-2.5">{row.generatedCount}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${scratchStatusStyle(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{row.history.length} évts</td>
                  <td className="px-3 py-2.5">
                    {row.status === "GENERE" ? (
                      <button type="button" onClick={() => void onTransitionLot(row.lotId, "ATTRIBUE")} className="rounded-lg border border-sky-300 bg-sky-600 px-2 py-1 text-[11px] font-medium text-white">
                        Attribuer
                      </button>
                    ) : row.status === "ATTRIBUE" ? (
                      <button type="button" onClick={() => void onTransitionLot(row.lotId, "ACTIF")} className="rounded-lg border border-violet-300 bg-violet-600 px-2 py-1 text-[11px] font-medium text-white">
                        Activer (N1)
                      </button>
                    ) : row.status === "ACTIF" ? (
                      <button type="button" onClick={() => void onTransitionLot(row.lotId, "EPUISE")} className="rounded-lg border border-amber-300 bg-amber-500 px-2 py-1 text-[11px] font-medium text-white">
                        Marquer épuisé
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <a href={`/api/scratch-codes/lots/${encodeURIComponent(row.lotId)}/export`} className="rounded-lg border border-emerald-300 bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-700">
                      Export lot
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Logs d’export GPR</h3>
        {loadingData ? (
          <p className="text-xs text-slate-600">Chargement...</p>
        ) : gprLogs.length === 0 ? (
          <p className="text-xs text-slate-600">Aucun export pour l’instant.</p>
        ) : (
          <div className="space-y-2 text-xs text-slate-800">
            {gprLogs.map((log) => (
              <article key={log.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p>
                  <span className="text-slate-600">{new Date(log.exportedAt).toLocaleString("fr-FR")}</span> · opérateur{" "}
                  <span className="font-mono text-[11px]">{log.operatorUserId}</span> · {log.entriesCount} entrées
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-emerald-700">{log.generatedFilename}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
