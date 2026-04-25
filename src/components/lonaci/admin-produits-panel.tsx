"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

interface ProduitRow {
  _id: string;
  code: string;
  libelle: string;
  prix?: number;
  actif: boolean;
}

export default function AdminProduitsPanel() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [produits, setProduits] = useState<ProduitRow[]>([]);
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [prix, setPrix] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLibelle, setEditLibelle] = useState("");
  const [editPrix, setEditPrix] = useState("");
  const [editActif, setEditActif] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [quickUpdatingId, setQuickUpdatingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [sortBy, setSortBy] = useState<"CODE" | "LABEL" | "PRICE_ASC" | "PRICE_DESC">("CODE");

  const inputClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

  const load = useCallback(async () => {
    setError(null);
    try {
      const resProduits = await fetch("/api/admin/produits", { credentials: "include", cache: "no-store" });
      if (resProduits.status === 401 || resProduits.status === 403) {
        setVisible(false);
        return;
      }
      if (!resProduits.ok) {
        setVisible(false);
        return;
      }
      const data = (await resProduits.json()) as { produits: ProduitRow[] };
      setProduits(Array.isArray(data.produits) ? data.produits : []);
      setVisible(true);
    } catch {
      setVisible(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onDataImported = () => {
      void load();
    };
    window.addEventListener("lonaci:data-imported", onDataImported);
    return () => window.removeEventListener("lonaci:data-imported", onDataImported);
  }, [load]);

  function startEdit(p: ProduitRow) {
    setError(null);
    setSuccess(null);
    setEditingId(p._id);
    setEditCode(p.code);
    setEditLibelle(p.libelle);
    setEditPrix(typeof p.prix === "number" ? String(p.prix) : "");
    setEditActif(p.actif);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setError(null);
    setSuccess(null);
    const c = editCode.trim();
    const l = editLibelle.trim();
    const prixNum = Number.parseInt(editPrix.replace(/\s/g, ""), 10);
    if (c.length < 2 || l.length < 2) {
      setError("Code et libellé : au moins 2 caractères.");
      return;
    }
    if (!Number.isFinite(prixNum) || prixNum < 0 || !Number.isInteger(prixNum)) {
      setError("Indiquez un prix valide en FCFA (entier ≥ 0).");
      return;
    }
    setSavingId(editingId);
    try {
      const res = await fetch(`/api/admin/produits/${editingId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, libelle: l, prix: prixNum, actif: editActif }),
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; produit?: ProduitRow; issues?: { message: string }[] }
        | null;
      if (res.status === 409) {
        setError(body?.message ?? "Modification impossible (conflit).");
        return;
      }
      if (!res.ok) {
        const msg =
          body?.message ??
          (body?.issues?.[0]?.message ? `Données invalides : ${body.issues[0].message}` : "Enregistrement impossible.");
        setError(msg);
        return;
      }
      if (body?.produit?._id) {
        setProduits((prev) =>
          prev
            .map((row) => (row._id === body.produit!._id ? body.produit! : row))
            .sort((a, b) => a.code.localeCompare(b.code, "fr")),
        );
        setSuccess(`Produit « ${body.produit.code} » mis à jour.`);
        setEditingId(null);
      }
    } catch {
      setError("Erreur réseau ou serveur.");
    } finally {
      setSavingId(null);
    }
  }

  async function onDelete(p: ProduitRow) {
    const ok = window.confirm(
      `Supprimer le produit « ${p.code} » ?\n\nSi des contrats ou dossiers utilisent encore ce code, il sera seulement désactivé.`,
    );
    if (!ok) return;
    setError(null);
    setSuccess(null);
    setDeletingId(p._id);
    try {
      const res = await fetch(`/api/admin/produits/${p._id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; produit?: ProduitRow; deactivated?: boolean; deleted?: boolean }
        | null;
      if (!res.ok) {
        setError(body?.message ?? "Suppression impossible.");
        return;
      }
      if (body?.deleted) {
        setProduits((prev) => prev.filter((row) => row._id !== p._id));
        setSuccess(`Produit « ${p.code} » supprimé.`);
        if (editingId === p._id) setEditingId(null);
        return;
      }
      if (body?.produit && body.deactivated) {
        setProduits((prev) => prev.map((row) => (row._id === body.produit!._id ? body.produit! : row)));
        setSuccess(body.message ?? `Produit « ${p.code} » désactivé (données encore liées).`);
        if (editingId === p._id) setEditingId(null);
      }
    } catch {
      setError("Erreur réseau ou serveur.");
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleActif(p: ProduitRow) {
    setError(null);
    setSuccess(null);
    setQuickUpdatingId(p._id);
    try {
      const res = await fetch(`/api/admin/produits/${p._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !p.actif }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; produit?: ProduitRow } | null;
      if (!res.ok || !body?.produit) {
        setError(body?.message ?? "Mise à jour du statut impossible.");
        return;
      }
      setProduits((prev) => prev.map((row) => (row._id === body.produit!._id ? body.produit! : row)));
      setSuccess(`Produit « ${body.produit.code} » ${body.produit.actif ? "activé" : "désactivé"}.`);
      if (editingId === p._id) setEditingId(null);
    } catch {
      setError("Erreur réseau ou serveur.");
    } finally {
      setQuickUpdatingId(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const c = code.trim();
    const l = libelle.trim();
    const prixNum = Number.parseInt(prix.replace(/\s/g, ""), 10);
    if (c.length < 2 || l.length < 2) {
      setError("Code et libellé : au moins 2 caractères.");
      return;
    }
    if (!Number.isFinite(prixNum) || prixNum < 0 || !Number.isInteger(prixNum)) {
      setError("Indiquez un prix valide en FCFA (entier ≥ 0).");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/produits", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, libelle: l, prix: prixNum }),
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; produit?: ProduitRow; issues?: { message: string }[] }
        | null;
      if (res.status === 409) {
        setError(body?.message ?? "Ce code produit existe déjà.");
        return;
      }
      if (!res.ok) {
        const msg =
          body?.message ??
          (body?.issues?.[0]?.message ? `Données invalides : ${body.issues[0].message}` : "Création impossible.");
        setError(msg);
        return;
      }
      if (body?.produit?._id) {
        setProduits((prev) => [...prev, body.produit!].sort((a, b) => a.code.localeCompare(b.code, "fr")));
      } else {
        await load();
      }
      setCode("");
      setLibelle("");
      setPrix("");
      setSuccess(`Produit « ${body?.produit?.code ?? c} » créé.`);
    } catch {
      setError("Erreur réseau ou serveur.");
    } finally {
      setCreating(false);
    }
  }

  if (loading || !visible) return null;

  const q = search.trim().toLowerCase();
  const filtered = produits
    .filter((p) => {
      if (statusFilter === "ACTIVE" && !p.actif) return false;
      if (statusFilter === "INACTIVE" && p.actif) return false;
      if (!q) return true;
      return p.code.toLowerCase().includes(q) || p.libelle.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === "LABEL") return a.libelle.localeCompare(b.libelle, "fr");
      if (sortBy === "PRICE_ASC") return (a.prix ?? 0) - (b.prix ?? 0);
      if (sortBy === "PRICE_DESC") return (b.prix ?? 0) - (a.prix ?? 0);
      return a.code.localeCompare(b.code, "fr");
    });

  const activeCount = produits.filter((p) => p.actif).length;
  const inactiveCount = produits.length - activeCount;
  const avgPrice =
    produits.length > 0
      ? Math.round(produits.reduce((sum, p) => sum + (typeof p.prix === "number" ? p.prix : 0), 0) / produits.length)
      : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Produits (référentiel)</h3>
          <p className="mt-1 text-xs text-slate-600">
            Création et modification réservées au <strong>chef de service</strong>. Le code est normalisé en
            majuscules.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.open("/api/admin/produits/export", "_blank", "noopener,noreferrer")}
          className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
        >
          Export PDF
        </button>
      </div>

      <form
        onSubmit={onCreate}
        className="mt-4 grid gap-3 rounded-xl border border-cyan-200/70 bg-cyan-50/40 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">Code produit *</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ex. LOTO"
            maxLength={32}
            className={inputClass}
            autoComplete="off"
            aria-label="Code produit"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">Libellé *</span>
          <input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Ex. Loterie nationale"
            maxLength={200}
            className={inputClass}
            aria-label="Libellé produit"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">Prix caution (FCFA) *</span>
          <input
            value={prix}
            onChange={(e) => setPrix(e.target.value.replace(/[^\d\s]/g, ""))}
            placeholder="Ex. 500"
            inputMode="numeric"
            className={inputClass}
            autoComplete="off"
            aria-label="Prix caution en FCFA"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg border border-cyan-600 bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:border-cyan-700 hover:bg-cyan-700 disabled:opacity-50"
        >
          {creating ? "Création…" : "Créer le produit"}
        </button>
      </form>

      {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</p> : null}
      {success ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {success}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-3">
        <p>
          Total produits : <strong>{produits.length}</strong>
        </p>
        <p>
          Actifs / Inactifs :{" "}
          <strong>
            {activeCount} / {inactiveCount}
          </strong>
        </p>
        <p>
          Prix caution moyen : <strong>{avgPrice.toLocaleString("fr-FR")} FCFA</strong>
        </p>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">Recherche</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code ou libellé"
            className={inputClass}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">Statut</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
            className={inputClass}
          >
            <option value="ALL">Tous</option>
            <option value="ACTIVE">Actifs uniquement</option>
            <option value="INACTIVE">Inactifs uniquement</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">Tri</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "CODE" | "LABEL" | "PRICE_ASC" | "PRICE_DESC")}
            className={inputClass}
          >
            <option value="CODE">Code (A → Z)</option>
            <option value="LABEL">Libellé (A → Z)</option>
            <option value="PRICE_ASC">Prix (croissant)</option>
            <option value="PRICE_DESC">Prix (décroissant)</option>
          </select>
        </label>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Libellé</th>
              <th className="px-3 py-2 font-semibold">Prix caution (FCFA)</th>
              <th className="px-3 py-2 font-semibold">Statut</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
              <th className="px-3 py-2 font-mono font-normal text-slate-500">ID</th>
            </tr>
          </thead>
          <tbody className="text-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  Aucun produit ne correspond au filtre.
                </td>
              </tr>
            ) : (
              filtered.map((p) =>
                editingId === p._id ? (
                  <tr key={p._id} className="border-b border-slate-100 bg-cyan-50/50 last:border-b-0">
                    <td colSpan={6} className="p-3">
                      <form
                        onSubmit={onSaveEdit}
                        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
                      >
                        <label className="grid gap-1 lg:col-span-2">
                          <span className="text-xs font-medium text-slate-700">Code</span>
                          <input
                            value={editCode}
                            onChange={(e) => setEditCode(e.target.value)}
                            maxLength={32}
                            className={inputClass}
                            aria-label="Modifier le code produit"
                          />
                        </label>
                        <label className="grid gap-1 lg:col-span-4">
                          <span className="text-xs font-medium text-slate-700">Libellé</span>
                          <input
                            value={editLibelle}
                            onChange={(e) => setEditLibelle(e.target.value)}
                            maxLength={200}
                            className={inputClass}
                            aria-label="Modifier le libellé"
                          />
                        </label>
                        <label className="grid gap-1 lg:col-span-2">
                          <span className="text-xs font-medium text-slate-700">Prix (FCFA)</span>
                          <input
                            value={editPrix}
                            onChange={(e) => setEditPrix(e.target.value.replace(/[^\d\s]/g, ""))}
                            inputMode="numeric"
                            className={inputClass}
                            aria-label="Modifier le prix"
                          />
                        </label>
                        <label className="flex items-center gap-2 lg:col-span-2">
                          <input
                            type="checkbox"
                            checked={editActif}
                            onChange={(e) => setEditActif(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                          />
                          <span className="text-xs font-medium text-slate-700">Actif</span>
                        </label>
                        <div className="flex flex-wrap gap-2 lg:col-span-2">
                          <button
                            type="submit"
                            disabled={savingId === p._id}
                            className="rounded-lg border border-cyan-600 bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
                          >
                            {savingId === p._id ? "Enregistrement…" : "Enregistrer"}
                          </button>
                          <button
                            type="button"
                            disabled={savingId === p._id}
                            onClick={cancelEdit}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Annuler
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={p._id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2 font-mono font-medium">{p.code}</td>
                    <td className="px-3 py-2">{p.libelle}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {typeof p.prix === "number" ? p.prix.toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {p.actif ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                          Actif
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                          Inactif
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          disabled={deletingId === p._id || editingId !== null}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleActif(p)}
                          disabled={deletingId === p._id || quickUpdatingId === p._id || editingId !== null}
                          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          {quickUpdatingId === p._id ? "…" : p.actif ? "Désactiver" : "Activer"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(p)}
                          disabled={deletingId === p._id || quickUpdatingId === p._id || editingId !== null}
                          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                        >
                          {deletingId === p._id ? "…" : "Supprimer"}
                        </button>
                      </div>
                    </td>
                    <td className="max-w-32 truncate px-3 py-2 font-mono text-[10px] text-slate-500" title={p._id}>
                      {p._id}
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

