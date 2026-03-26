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
  const [exporting, setExporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitre, setEditTitre] = useState("");
  const [editCommentaire, setEditCommentaire] = useState("");
  const [q, setQ] = useState("");
  const [filterStatut, setFilterStatut] = useState("");
  const [filterAgence, setFilterAgence] = useState("");

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
      if (q.trim()) params.set("q", q.trim());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterAgence) params.set("agenceId", filterAgence);
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
  }, [module, page, q, filterStatut, filterAgence]);

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
      setAgenceId("");
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

  async function saveEdit() {
    if (!editingId) return;
    const nextTitre = editTitre.trim();
    if (nextTitre.length < 2) {
      setError("Le titre doit contenir au moins 2 caractères.");
      return;
    }
    setBusyId(editingId);
    setError(null);
    try {
      const res = await fetch(`/api/lonaci-registries/${editingId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: nextTitre,
          commentaire: editCommentaire.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      setEditTitre("");
      setEditCommentaire("");
      await load();
    } catch {
      setError("Mise à jour impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteEntry(id: string, reference: string) {
    const ok = window.confirm(`Supprimer l'entrée ${reference} ?`);
    if (!ok) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/lonaci-registries/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError("Suppression impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        module,
        page: "1",
        pageSize: "1000",
      });
      if (q.trim()) params.set("q", q.trim());
      if (filterStatut) params.set("statut", filterStatut);
      if (filterAgence) params.set("agenceId", filterAgence);
      const res = await fetch(`/api/lonaci-registries?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { items: Row[] };
      const rows = Array.isArray(data.items) ? data.items : [];
      const escapeCsv = (value: string | null | undefined) => {
        const raw = value ?? "";
        const escaped = raw.replace(/"/g, '""');
        return `"${escaped}"`;
      };
      const header = ["reference", "module", "titre", "statut", "agenceId", "concessionnaireId", "commentaire", "updatedAt"];
      const lines = rows.map((row) =>
        [
          escapeCsv(row.reference),
          escapeCsv(module),
          escapeCsv(row.titre),
          escapeCsv(row.statut),
          escapeCsv(row.agenceId),
          escapeCsv(row.concessionnaireId),
          escapeCsv(row.commentaire),
          escapeCsv(new Date(row.updatedAt).toISOString()),
        ].join(","),
      );
      const csv = [header.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `registre-${module.toLowerCase()}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Export CSV impossible.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {!omitSectionHeader ? (
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </header>
      ) : null}

      <form onSubmit={onCreate} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Nouvelle entrée</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 block text-sm">
            <span className="text-slate-600">Titre / objet</span>
            <input
              required
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">ID concessionnaire (optionnel)</span>
            <input
              value={concessionnaireId}
              onChange={(e) => setConcessionnaireId(e.target.value)}
              placeholder="ObjectId Mongo"
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Agence</span>
            <select
              value={agenceId}
              onChange={(e) => setAgenceId(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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
            <span className="text-slate-600">Statut initial</span>
            <select
              value={statut}
              onChange={(e) => setStatut(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {statuts.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2 block text-sm">
            <span className="text-slate-600">Commentaire</span>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="mt-3 rounded-lg border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {creating ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Recherche référence, titre, commentaire"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
          <select
            value={filterStatut}
            onChange={(e) => {
              setPage(1);
              setFilterStatut(e.target.value);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Tous les statuts</option>
            {statuts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filterAgence}
            onChange={(e) => {
              setPage(1);
              setFilterAgence(e.target.value);
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Toutes les agences</option>
            {LONACI_AGENCES.filter((a) => a.value).map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setQ("");
              setFilterStatut("");
              setFilterAgence("");
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Réinitialiser filtres
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">Registre ({total})</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading || exporting}
              onClick={() => void exportCsv()}
              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
            >
              {exporting ? "Export..." : "Exporter CSV"}
            </button>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
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
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
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
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="pb-2 pr-3">Réf.</th>
                  <th className="pb-2 pr-3">Titre</th>
                  <th className="pb-2 pr-3">Agence</th>
                  <th className="pb-2 pr-3">Statut</th>
                  <th className="pb-2 pr-3">Maj</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">{row.reference}</td>
                    <td className="py-2 pr-3 text-slate-900">
                      <div className="font-medium">{row.titre}</div>
                      {row.commentaire ? <div className="text-xs text-slate-500">{row.commentaire}</div> : null}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{row.agenceId ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{row.statut}</span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {new Date(row.updatedAt).toLocaleString("fr-FR")}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Changer le statut pour ${row.reference}`}
                          value={row.statut}
                          disabled={busyId === row.id}
                          onChange={(e) => void patchStatut(row.id, e.target.value)}
                          className="max-w-[180px] rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        >
                          {statuts.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => {
                            setEditingId(row.id);
                            setEditTitre(row.titre);
                            setEditCommentaire(row.commentaire ?? "");
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void deleteEntry(row.id, row.reference)}
                          className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Fermer la fenêtre d'édition"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => {
              if (busyId === editingId) return;
              setEditingId(null);
            }}
          />
          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Modifier l’entrée</h3>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Titre</span>
                <input
                  value={editTitre}
                  onChange={(e) => setEditTitre(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-slate-600">Commentaire</span>
                <textarea
                  rows={3}
                  value={editCommentaire}
                  onChange={(e) => setEditCommentaire(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busyId === editingId}
                onClick={() => setEditingId(null)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busyId === editingId}
                onClick={() => void saveEdit()}
                className="rounded border border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {busyId === editingId ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
