"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  GRATTAGE_CONTRAT_STATUT_LABELS,
  GRATTAGE_CONTRAT_STATUTS_SPEC_93,
  type GrattageContratStatut,
} from "@/lib/lonaci/constants";

type RefAgence = { id: string; code: string; libelle: string };
type RefProduit = { code: string; libelle: string; actif: boolean };

type ContratRow = {
  id: string;
  reference: string;
  concessionnaireId: string;
  codePdv: string;
  raisonSociale: string;
  agenceId: string | null;
  produitCode: string;
  statut: GrattageContratStatut;
  statutLabel: string;
  dateDebut: string;
  dateFin: string | null;
  createdAt: string;
};

function statutBadgeClass(statut: GrattageContratStatut) {
  if (statut === "EN_COURS") return "border-emerald-300 bg-emerald-100 text-emerald-900";
  if (statut === "SUSPENDU") return "border-amber-300 bg-amber-100 text-amber-900";
  if (statut === "RESILIE") return "border-rose-300 bg-rose-100 text-rose-900";
  return "border-slate-300 bg-slate-100 text-slate-800";
}

export default function ContratsGrattagePanel() {
  const [agences, setAgences] = useState<RefAgence[]>([]);
  const [items, setItems] = useState<ContratRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterAgenceId, setFilterAgenceId] = useState("");
  const [filterConcessionnaireId, setFilterConcessionnaireId] = useState("");
  const [filterStatut, setFilterStatut] = useState<"" | GrattageContratStatut>("");

  const exportHref = useMemo(() => {
    const p = new URLSearchParams({ format: "pdf" });
    if (filterAgenceId) p.set("agenceId", filterAgenceId);
    if (filterConcessionnaireId.trim()) p.set("concessionnaireId", filterConcessionnaireId.trim());
    if (filterStatut) p.set("statut", filterStatut);
    return `/api/grattage-contrats/export?${p}`;
  }, [filterAgenceId, filterConcessionnaireId, filterStatut]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (filterAgenceId) params.set("agenceId", filterAgenceId);
      if (filterConcessionnaireId.trim()) params.set("concessionnaireId", filterConcessionnaireId.trim());
      if (filterStatut) params.set("statut", filterStatut);
      const res = await fetch(`/api/grattage-contrats?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Chargement des contrats impossible");
      const body = (await res.json()) as { items: ContratRow[]; total: number };
      setItems(body.items ?? []);
      setTotal(body.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [filterAgenceId, filterConcessionnaireId, filterStatut]);

  useEffect(() => {
    void (async () => {
      try {
        const refRes = await fetch("/api/referentials", { credentials: "include", cache: "no-store" });
        if (refRes.ok) {
          const ref = (await refRes.json()) as { agences: RefAgence[] };
          setAgences((ref.agences ?? []).filter((a) => a.id));
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function onTransition(id: string, targetStatut: GrattageContratStatut) {
    setError(null);
    const res = await fetch(`/api/grattage-contrats/${encodeURIComponent(id)}/statut`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetStatut, comment: null }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? "Transition refusée");
      return;
    }
    await loadList();
  }

  const kpis = useMemo(() => {
    const byStatut = Object.fromEntries(GRATTAGE_CONTRAT_STATUTS_SPEC_93.map((s) => [s.statut, 0])) as Record<
      GrattageContratStatut,
      number
    >;
    for (const row of items) byStatut[row.statut] = (byStatut[row.statut] ?? 0) + 1;
    return byStatut;
  }, [items]);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-800">§9.3 Contrat grattage</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Liste et cycle de vie des contrats grattage</h1>
        <p className="mt-2 text-sm text-slate-600">
          Filtres par agence, concessionnaire et statut. Export PDF. Création automatique à la validation GPR finale (
          <Link href="/gpr" className="text-teal-700 underline">
            module GPR
          </Link>
          ).
        </p>
      </header>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {GRATTAGE_CONTRAT_STATUTS_SPEC_93.map((s) => (
          <article key={s.statut} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[11px] font-medium text-slate-600">{s.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{kpis[s.statut] ?? 0}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-slate-700">Agence</span>
              <select
                value={filterAgenceId}
                onChange={(e) => setFilterAgenceId(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-2"
              >
                <option value="">Toutes</option>
                {agences.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.libelle}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-slate-700">ID concessionnaire</span>
              <input
                value={filterConcessionnaireId}
                onChange={(e) => setFilterConcessionnaireId(e.target.value)}
                placeholder="Filtrer par PDV"
                className="rounded-lg border border-slate-300 px-2 py-2 font-mono text-[11px]"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-slate-700">Statut</span>
              <select
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value as "" | GrattageContratStatut)}
                className="rounded-lg border border-slate-300 px-2 py-2"
              >
                <option value="">Tous</option>
                {GRATTAGE_CONTRAT_STATUTS_SPEC_93.map((s) => (
                  <option key={s.statut} value={s.statut}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <a
            href={exportHref}
            className="inline-flex items-center justify-center rounded-lg border border-teal-300 bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
          >
            Export PDF
          </a>
        </div>

        <p className="mt-3 text-xs text-slate-600">
          {loading ? "Chargement…" : `${total} contrat(s) · page affichée : ${items.length}`}
        </p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-700">
                <th className="px-3 py-2">Référence</th>
                <th className="px-3 py-2">PDV</th>
                <th className="px-3 py-2">Produit</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Début</th>
                <th className="px-3 py-2">Fin</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 bg-white">
                  <td className="px-3 py-2 font-mono text-[11px]">{row.reference}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-[11px] text-slate-600">{row.codePdv}</span>
                    <br />
                    <span className="text-slate-900">{row.raisonSociale}</span>
                  </td>
                  <td className="px-3 py-2">{row.produitCode}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${statutBadgeClass(row.statut)}`}
                    >
                      {row.statutLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2">{new Date(row.dateDebut).toLocaleDateString("fr-FR")}</td>
                  <td className="px-3 py-2">
                    {row.dateFin ? new Date(row.dateFin).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.statut === "EN_COURS" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void onTransition(row.id, "SUSPENDU")}
                            className="rounded border border-amber-300 bg-amber-500 px-2 py-0.5 text-[10px] font-medium text-white"
                          >
                            Suspendre
                          </button>
                          <button
                            type="button"
                            onClick={() => void onTransition(row.id, "RESILIE")}
                            className="rounded border border-rose-300 bg-rose-600 px-2 py-0.5 text-[10px] font-medium text-white"
                          >
                            Résilier
                          </button>
                        </>
                      ) : null}
                      {row.statut === "SUSPENDU" ? (
                        <button
                          type="button"
                          onClick={() => void onTransition(row.id, "EN_COURS")}
                          className="rounded border border-emerald-300 bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white"
                        >
                          Reprendre
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-500">Aucun contrat grattage.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
