"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { SCRATCH_CODE_STATUT_LABELS, type ScratchCodeStatut } from "@/lib/lonaci/constants";

type RefProduit = { code: string; libelle: string; actif: boolean };

type Dashboard = {
  codesDistribues: number;
  soldeRestant: number;
  lotsTotal: number;
  lotsEnAttenteAttribution: number;
  lotsActifs: number;
  alertesRupture: Array<{
    produitCode: string;
    soldeRestant: number;
    codesDistribues: number;
    seuil: number;
  }>;
  seuilAlerte: number;
  generatedAt: string;
};

type EligiblePdv = {
  id: string;
  codePdv: string;
  raisonSociale: string;
  agenceId: string | null;
  produitCode: string;
};

type ScratchLot = {
  id: string;
  lotId: string;
  concessionnaireId: string;
  produitCode: string;
  generatedCount: number;
  status: ScratchCodeStatut;
  attribueAt: string | null;
  createdAt: string;
  history: Array<{ action: string; at: string }>;
};

function statusClass(status: ScratchCodeStatut) {
  if (status === "GENERE") return "border-slate-300 bg-slate-100 text-slate-900";
  if (status === "ATTRIBUE") return "border-sky-300 bg-sky-100 text-sky-900";
  if (status === "ACTIF") return "border-emerald-300 bg-emerald-100 text-emerald-900";
  return "border-amber-300 bg-amber-100 text-amber-900";
}

export default function DispatcherGrattagePage() {
  const [produits, setProduits] = useState<RefProduit[]>([]);
  const [produitCode, setProduitCode] = useState("");
  const [pdvSearch, setPdvSearch] = useState("");
  const [eligible, setEligible] = useState<EligiblePdv[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [lots, setLots] = useState<ScratchLot[]>([]);
  const [selectedPdvId, setSelectedPdvId] = useState<string | null>(null);
  const [history, setHistory] = useState<{
    items: ScratchLot[];
    codesByStatus: Partial<Record<ScratchCodeStatut, number>>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attributingLot, setAttributingLot] = useState<string | null>(null);

  const selectedPdv = useMemo(
    () => eligible.find((p) => p.id === selectedPdvId) ?? null,
    [eligible, selectedPdvId],
  );

  const loadDashboard = useCallback(async () => {
    const res = await fetch("/api/scratch-codes/dashboard", { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error("Tableau de bord indisponible");
    setDashboard((await res.json()) as Dashboard);
  }, []);

  const loadLots = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", pageSize: "30", status: "GENERE" });
    if (produitCode) params.set("produitCode", produitCode);
    if (selectedPdvId) params.set("concessionnaireId", selectedPdvId);
    const res = await fetch(`/api/scratch-codes/lots?${params}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error("Lots indisponibles");
    const body = (await res.json()) as { items: ScratchLot[] };
    setLots(body.items ?? []);
  }, [produitCode, selectedPdvId]);

  const loadEligible = useCallback(async () => {
    if (!produitCode) {
      setEligible([]);
      return;
    }
    const params = new URLSearchParams({ produitCode, limit: "80" });
    if (pdvSearch.trim()) params.set("q", pdvSearch.trim());
    const res = await fetch(`/api/scratch-codes/eligible-concessionnaires?${params}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Liste éligible indisponible");
    const body = (await res.json()) as { items: EligiblePdv[] };
    setEligible(body.items ?? []);
  }, [produitCode, pdvSearch]);

  const loadHistory = useCallback(async (concessionnaireId: string) => {
    const params = new URLSearchParams({ concessionnaireId, page: "1", pageSize: "50" });
    const res = await fetch(`/api/scratch-codes/history?${params}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error("Historique indisponible");
    setHistory((await res.json()) as { items: ScratchLot[]; codesByStatus: Partial<Record<ScratchCodeStatut, number>> });
  }, []);

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      const refRes = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
      if (!refRes.ok) throw new Error("Référentiels indisponibles");
      const refBody = (await refRes.json()) as { produits: RefProduit[] };
      const active = (refBody.produits ?? []).filter((p) => p.actif);
      setProduits(active);
      if (!produitCode && active[0]) setProduitCode(active[0].code);
      await Promise.all([loadDashboard(), loadLots(), loadEligible()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!produitCode) return;
    void loadEligible();
  }, [produitCode, pdvSearch, loadEligible]);

  useEffect(() => {
    if (!produitCode) return;
    void loadLots();
  }, [produitCode, selectedPdvId, loadLots]);

  useEffect(() => {
    if (!selectedPdvId) {
      setHistory(null);
      return;
    }
    void loadHistory(selectedPdvId);
  }, [selectedPdvId, loadHistory]);

  async function onAttribuerLot(e: FormEvent, lotId: string, concessionnaireId: string) {
    e.preventDefault();
    setAttributingLot(lotId);
    setError(null);
    try {
      const res = await fetch(`/api/scratch-codes/lots/${encodeURIComponent(lotId)}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus: "ATTRIBUE" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Attribution impossible");
      }
      await Promise.all([loadDashboard(), loadLots(), selectedPdvId ? loadHistory(selectedPdvId) : Promise.resolve()]);
      if (concessionnaireId === selectedPdvId) void loadHistory(concessionnaireId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAttributingLot(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 p-5 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">§9.2 Dispatcher</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Distribution codes grattage</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Attribution en temps réel, concessionnaires éligibles par produit, suivi des stocks et alertes de rupture.
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {dashboard ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-xs text-emerald-800">Codes distribués</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-950">{dashboard.codesDistribues}</p>
          </article>
          <article className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
            <p className="text-xs text-sky-800">Solde restant (non attribués)</p>
            <p className="mt-1 text-2xl font-semibold text-sky-950">{dashboard.soldeRestant}</p>
          </article>
          <article className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-xs text-amber-800">Lots en attente d&apos;attribution</p>
            <p className="mt-1 text-2xl font-semibold text-amber-950">{dashboard.lotsEnAttenteAttribution}</p>
          </article>
          <article className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
            <p className="text-xs text-violet-800">Lots actifs</p>
            <p className="mt-1 text-2xl font-semibold text-violet-950">{dashboard.lotsActifs}</p>
          </article>
        </section>
      ) : null}

      {dashboard && dashboard.alertesRupture.length > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
          <h2 className="text-sm font-semibold text-rose-900">
            Alertes rupture (solde &lt; {dashboard.seuilAlerte} codes)
          </h2>
          <ul className="mt-2 space-y-1 text-xs text-rose-900">
            {dashboard.alertesRupture.map((a) => (
              <li key={a.produitCode}>
                <strong>{a.produitCode}</strong> — solde {a.soldeRestant} · déjà distribués {a.codesDistribues}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Concessionnaires éligibles</h2>
          <p className="mt-1 text-xs text-slate-600">Contrat actif + enregistrement GPR validé pour le produit.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-slate-700">Produit</span>
              <select
                value={produitCode}
                onChange={(e) => {
                  setProduitCode(e.target.value);
                  setSelectedPdvId(null);
                }}
                className="rounded-lg border border-slate-300 px-2 py-2"
              >
                {produits.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.libelle}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-slate-700">Recherche PDV</span>
              <input
                value={pdvSearch}
                onChange={(e) => setPdvSearch(e.target.value)}
                placeholder="Code ou raison sociale"
                className="rounded-lg border border-slate-300 px-2 py-2"
              />
            </label>
          </div>
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-xs">
            {eligible.length === 0 ? (
              <li className="text-slate-500">{loading ? "Chargement…" : "Aucun PDV éligible."}</li>
            ) : (
              eligible.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPdvId(p.id)}
                    className={`w-full rounded-lg border px-2 py-2 text-left transition ${
                      selectedPdvId === p.id
                        ? "border-violet-400 bg-violet-50"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <span className="font-mono text-[11px] text-slate-600">{p.codePdv}</span>
                    <span className="ml-2 font-medium text-slate-900">{p.raisonSociale}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Historique PDV (§9.1)</h2>
          {selectedPdv ? (
            <p className="mt-1 text-xs text-slate-600">
              {selectedPdv.codePdv} — {selectedPdv.raisonSociale}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Sélectionnez un concessionnaire.</p>
          )}
          {history && selectedPdv ? (
            <>
              <p className="mt-2 text-[11px] text-slate-600">
                Codes par statut :{" "}
                {(Object.keys(SCRATCH_CODE_STATUT_LABELS) as ScratchCodeStatut[]).map((s) => (
                  <span key={s} className="mr-2">
                    {SCRATCH_CODE_STATUT_LABELS[s]} {history.codesByStatus[s] ?? 0}
                  </span>
                ))}
              </p>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
                {history.items.map((lot) => (
                  <li key={lot.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <span className="font-mono">{lot.lotId}</span> · {lot.generatedCount} codes ·{" "}
                    <span className={statusClass(lot.status)}>{SCRATCH_CODE_STATUT_LABELS[lot.status]}</span>
                    {lot.attribueAt ? (
                      <span className="ml-1 text-slate-500">
                        attribué {new Date(lot.attribueAt).toLocaleString("fr-FR")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Lots à attribuer (temps réel)</h2>
        <p className="mt-1 text-xs text-slate-600">
          Lots au statut Généré — sélectionnez un PDV éligible puis attribuez le lot.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-700">
                <th className="px-2 py-2">Lot</th>
                <th className="px-2 py-2">Produit</th>
                <th className="px-2 py-2">Quantité</th>
                <th className="px-2 py-2">PDV cible</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-mono">{lot.lotId}</td>
                  <td className="px-2 py-2">{lot.produitCode}</td>
                  <td className="px-2 py-2">{lot.generatedCount}</td>
                  <td className="px-2 py-2">
                    {selectedPdv && lot.produitCode === produitCode ? (
                      <span>
                        {selectedPdv.codePdv} — {selectedPdv.raisonSociale}
                      </span>
                    ) : (
                      <span className="text-slate-400">Choisir un PDV éligible</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {selectedPdv && lot.produitCode === produitCode ? (
                      <button
                        type="button"
                        disabled={attributingLot === lot.lotId}
                        onClick={(e) => void onAttribuerLot(e, lot.lotId, selectedPdv.id)}
                        className="rounded-lg border border-sky-300 bg-sky-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                      >
                        {attributingLot === lot.lotId ? "…" : "Attribuer"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lots.length === 0 && !loading ? (
            <p className="mt-2 text-xs text-slate-500">Aucun lot en attente pour ce produit.</p>
          ) : null}
        </div>
      </section>

      <p className="text-[11px] text-slate-500">
        Dernière mise à jour tableau de bord :{" "}
        {dashboard ? new Date(dashboard.generatedAt).toLocaleString("fr-FR") : "—"}
      </p>
    </div>
  );
}
