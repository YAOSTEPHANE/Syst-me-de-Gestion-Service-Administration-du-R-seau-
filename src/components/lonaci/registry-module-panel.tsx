"use client";

import { useCallback, useEffect, useState } from "react";

import { LONACI_AGENCES } from "@/components/lonaci/lonaci-nav";

type RegistryModule = "AGREMENT" | "CESSION" | "GPR";

export interface RegistryModulePanelProps {
  module: RegistryModule;
  title: string;
  description: string;
  statuts: readonly string[];
  defaultStatut: string;
  /** Masquer le bandeau titre / description (pages composites) */
  omitSectionHeader?: boolean;
}

interface Row {
  id: string;
  reference: string;
  titre: string;
  concessionnaireId: string | null;
  agenceId: string | null;
  statut: string;
  commentaire: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function RegistryModulePanel({
  module,
  title,
  description,
  statuts,
  defaultStatut,
  omitSectionHeader = false,
}: RegistryModulePanelProps) {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [titre, setTitre] = useState("");
  const [concessionnaireId, setConcessionnaireId] = useState("");
  const [agenceId, setAgenceId] = useState("");
  const [statut, setStatut] = useState(defaultStatut);
  const [commentaire, setCommentaire] = useState("");
  const [creating, setCreating] = useState(false);

  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        module,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/lonaci-registries?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Chargement impossible");
      const data = (await res.json()) as { items: Row[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setError("Impossible de charger le registre.");
    } finally {
      setLoading(false);
    }
  }, [module, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/lonaci-registries", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module,
          titre: titre.trim(),
          concessionnaireId: concessionnaireId.trim() || null,
          agenceId: agenceId.trim() || null,
          statut,
          commentaire: commentaire.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      setTitre("");
      setConcessionnaireId("");
      setCommentaire("");
      setStatut(defaultStatut);
      await load();
    } catch {
      setError("Création impossible.");
    } finally {
      setCreating(false);
    }
  }

  async function patchStatut(id: string, next: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/lonaci-registries/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: next }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError("Mise à jour impossible.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {!omitSectionHeader ? (
        <header>
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </header>
      ) : null}

      <form onSubmit={onCreate} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Nouvelle entrée</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 block text-sm">
            <span className="text-slate-400">Titre / objet</span>
            <input
              required
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">ID concessionnaire (optionnel)</span>
            <input
              value={concessionnaireId}
              onChange={(e) => setConcessionnaireId(e.target.value)}
              placeholder="ObjectId Mongo"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Agence</span>
            <select
              value={agenceId}
              onChange={(e) => setAgenceId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">—</option>
              {LONACI_AGENCES.filter((a) => a.value).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-400">Statut initial</span>
            <select
              value={statut}
              onChange={(e) => setStatut(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              {statuts.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2 block text-sm">
            <span className="text-slate-400">Commentaire</span>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="mt-3 rounded-lg border border-indigo-600 bg-indigo-950/40 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-950/70 disabled:opacity-50"
        >
          {creating ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-300">Registre ({total})</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              Préc.
            </button>
            <span className="text-xs text-slate-500">
              {page}/{totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              Suiv.
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune entrée pour l’instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-3">Réf.</th>
                  <th className="pb-2 pr-3">Titre</th>
                  <th className="pb-2 pr-3">Statut</th>
                  <th className="pb-2 pr-3">Maj</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800/80">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-300">{row.reference}</td>
                    <td className="py-2 pr-3 text-slate-200">{row.titre}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-amber-200">{row.statut}</span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {new Date(row.updatedAt).toLocaleString("fr-FR")}
                    </td>
                    <td className="py-2">
                      <select
                        aria-label={`Changer le statut pour ${row.reference}`}
                        value={row.statut}
                        disabled={busyId === row.id}
                        onChange={(e) => void patchStatut(row.id, e.target.value)}
                        className="max-w-[160px] rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                      >
                        {statuts.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
