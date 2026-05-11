"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import type { AgenceZoneGeographique } from "@/lib/lonaci/types";

interface AgenceRow {
  _id: string;
  code: string;
  libelle: string;
  zoneGeographique: AgenceZoneGeographique;
  actif: boolean;
}

function libelleZoneGeographique(z: AgenceZoneGeographique): string {
  return z === "ABIDJAN" ? "Abidjan" : "Intérieur";
}

export default function AdminAgencesPanel() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [agences, setAgences] = useState<AgenceRow[]>([]);
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [createZone, setCreateZone] = useState<AgenceZoneGeographique>("INTERIEUR");
  const [createActif, setCreateActif] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLibelle, setEditLibelle] = useState("");
  const [editZone, setEditZone] = useState<AgenceZoneGeographique>("INTERIEUR");
  const [editActif, setEditActif] = useState(true);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [togglingActifId, setTogglingActifId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/agences", { credentials: "include", cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setVisible(false);
        return;
      }
      if (!res.ok) {
        setVisible(false);
        return;
      }
      const data = (await res.json()) as { agences: AgenceRow[] };
      setAgences(Array.isArray(data.agences) ? data.agences : []);
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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const c = code.trim();
    const l = libelle.trim();
    if (c.length < 2 || l.length < 2) {
      setError("Code et libellé : au moins 2 caractères.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/agences", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, libelle: l, zoneGeographique: createZone, actif: createActif }),
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; agence?: AgenceRow; issues?: { message: string }[] }
        | null;
      if (res.status === 409) {
        setError(body?.message ?? "Ce code agence existe déjà.");
        return;
      }
      if (!res.ok) {
        const msg =
          body?.message ??
          (body?.issues?.[0]?.message ? `Données invalides : ${body.issues[0].message}` : "Création impossible.");
        setError(msg);
        return;
      }
      if (body?.agence?._id) {
        setAgences((prev) => [...prev, body.agence!].sort((a, b) => a.code.localeCompare(b.code, "fr")));
      } else {
        await load();
      }
      setCode("");
      setLibelle("");
      setCreateZone("INTERIEUR");
      setCreateActif(true);
      setSuccess(`Agence « ${body?.agence?.code ?? c} » créée.`);
    } catch {
      setError("Erreur réseau ou serveur.");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(a: AgenceRow) {
    setError(null);
    setSuccess(null);
    setEditingId(a._id);
    setEditCode(a.code);
    setEditLibelle(a.libelle);
    setEditZone(a.zoneGeographique);
    setEditActif(a.actif);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCode("");
    setEditLibelle("");
    setEditZone("INTERIEUR");
    setEditActif(true);
    setSavingEditId(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    setError(null);
    setSuccess(null);
    const c = editCode.trim();
    const l = editLibelle.trim();
    if (c.length < 2 || l.length < 2) {
      setError("Code et libellé : au moins 2 caractères.");
      return;
    }
    setSavingEditId(editingId);
    try {
      const res = await fetch(`/api/admin/agences/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, libelle: l, zoneGeographique: editZone, actif: editActif }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; agence?: AgenceRow } | null;
      if (res.status === 409) {
        setError(body?.message ?? "Ce code agence est déjà utilisé.");
        return;
      }
      if (!res.ok) {
        setError(body?.message ?? "Enregistrement impossible.");
        return;
      }
      if (body?.agence?._id) {
        setAgences((prev) =>
          prev
            .map((row) => (row._id === body.agence!._id ? body.agence! : row))
            .sort((a, b) => a.code.localeCompare(b.code, "fr")),
        );
        setSuccess(`Agence « ${body.agence.code} » mise à jour.`);
        window.dispatchEvent(new Event("lonaci:data-imported"));
      } else {
        await load();
        window.dispatchEvent(new Event("lonaci:data-imported"));
      }
      cancelEdit();
    } catch {
      setError("Erreur réseau ou serveur.");
    } finally {
      setSavingEditId(null);
    }
  }

  async function patchAgenceActif(a: AgenceRow, actif: boolean) {
    if (editingId) return;
    setError(null);
    setSuccess(null);
    setTogglingActifId(a._id);
    try {
      const res = await fetch(`/api/admin/agences/${encodeURIComponent(a._id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: a.code,
          libelle: a.libelle,
          zoneGeographique: a.zoneGeographique,
          actif,
        }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; agence?: AgenceRow } | null;
      if (!res.ok) {
        setError(body?.message ?? "Mise à jour du statut impossible.");
        return;
      }
      if (body?.agence?._id) {
        setAgences((prev) =>
          prev.map((row) => (row._id === body.agence!._id ? body.agence! : row)).sort((a, b) => a.code.localeCompare(b.code, "fr")),
        );
        setSuccess(`Agence « ${a.code} » : ${actif ? "active" : "inactive"}.`);
        window.dispatchEvent(new Event("lonaci:data-imported"));
      } else {
        await load();
        window.dispatchEvent(new Event("lonaci:data-imported"));
      }
    } catch {
      setError("Erreur réseau ou serveur.");
    } finally {
      setTogglingActifId(null);
    }
  }

  async function requestDelete(a: AgenceRow) {
    if (editingId) return;
    const confirmed = window.confirm(
      `Supprimer définitivement l’agence « ${a.code} — ${a.libelle} » ?\n\n` +
        `Action irréversible. Elle n’est possible que si aucun PDV, utilisateur, dossier ou autre enregistrement n’y est rattaché.`,
    );
    if (!confirmed) return;
    setError(null);
    setSuccess(null);
    setDeletingId(a._id);
    try {
      const res = await fetch(`/api/admin/agences/${encodeURIComponent(a._id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (res.status === 409) {
        setError(body?.message ?? "Suppression impossible : l’agence est encore utilisée.");
        return;
      }
      if (res.status === 404) {
        setError(body?.message ?? "Agence introuvable.");
        await load();
        return;
      }
      if (!res.ok) {
        setError(body?.message ?? "Suppression impossible.");
        return;
      }
      setAgences((prev) => prev.filter((row) => row._id !== a._id));
      setSuccess(`Agence « ${a.code} » supprimée.`);
      window.dispatchEvent(new Event("lonaci:data-imported"));
    } catch {
      setError("Erreur réseau ou serveur.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading || !visible) return null;

  const inputClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Agences (référentiel)</h3>
          <p className="mt-1 text-xs text-slate-600">
            Création et modification réservées au <strong>chef de service</strong>. Le code est normalisé en majuscules.
            Les liens métier (utilisateurs, PDV…) utilisent l’identifiant technique de l’agence. La zone (Abidjan /
            intérieur) sert aux matrices contrats et rapports : sans champ en base, l’ancienne règle (libellé « abidjan »
            ou code <code className="rounded bg-slate-100 px-0.5 font-mono">^ABJ</code>) s’applique encore jusqu’à
            enregistrement explicite.             La suppression n’est autorisée que si aucun enregistrement n’y est rattaché. Une agence inactive reste
            visible ici mais disparaît des sélecteurs métier (création PDV, filtres) qui ne listent que les agences
            actives.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.open("/api/admin/agences/export", "_blank", "noopener,noreferrer")}
          className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
        >
          Export PDF
        </button>
      </div>

      <form
        onSubmit={onCreate}
        className="mt-4 grid gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3 sm:grid-cols-[1fr_2fr_minmax(9rem,auto)_minmax(8rem,auto)_auto] sm:items-end"
      >
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">Code agence *</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ex. ABIDJAN"
            maxLength={32}
            className={inputClass}
            autoComplete="off"
            aria-label="Code agence"
          />
        </label>
        <label className="grid gap-1 sm:col-span-1">
          <span className="text-xs font-medium text-slate-700">Libellé *</span>
          <input
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Ex. Agence Abidjan Centre"
            maxLength={200}
            className={inputClass}
            aria-label="Libellé agence"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">Zone *</span>
          <select
            value={createZone}
            onChange={(e) => setCreateZone(e.target.value as AgenceZoneGeographique)}
            className={inputClass}
            aria-label="Zone géographique agence"
          >
            <option value="ABIDJAN">Abidjan</option>
            <option value="INTERIEUR">Intérieur</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-700">Statut *</span>
          <select
            value={createActif ? "true" : "false"}
            onChange={(e) => setCreateActif(e.target.value === "true")}
            className={inputClass}
            aria-label="Statut actif à la création"
          >
            <option value="true">Actif</option>
            <option value="false">Inactif</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={creating}
          className="w-full rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-700 hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
        >
          {creating ? "Création…" : "Créer l’agence"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</p>
      ) : null}
      {success ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {success}
        </p>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Libellé</th>
              <th className="px-3 py-2 font-semibold">Zone</th>
              <th className="px-3 py-2 font-semibold">Statut</th>
              <th className="px-3 py-2 font-mono font-normal text-slate-500">ID</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="text-slate-800">
            {agences.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  Aucune agence en base.
                </td>
              </tr>
            ) : (
              agences.map((a) => {
                const isEditing = editingId === a._id;
                return (
                  <tr key={a._id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                          maxLength={32}
                          className={`${inputClass} w-full min-w-[7rem] font-mono text-xs`}
                          aria-label={`Code agence ${a._id}`}
                          autoComplete="off"
                        />
                      ) : (
                        <span className="font-mono font-medium">{a.code}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          value={editLibelle}
                          onChange={(e) => setEditLibelle(e.target.value)}
                          maxLength={200}
                          className={`${inputClass} w-full min-w-[10rem] text-xs`}
                          aria-label={`Libellé agence ${a._id}`}
                        />
                      ) : (
                        a.libelle
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <select
                          value={editZone}
                          onChange={(e) => setEditZone(e.target.value as AgenceZoneGeographique)}
                          className={`${inputClass} w-full min-w-[8rem] text-xs`}
                          aria-label={`Zone agence ${a._id}`}
                        >
                          <option value="ABIDJAN">Abidjan</option>
                          <option value="INTERIEUR">Intérieur</option>
                        </select>
                      ) : (
                        <span className="text-slate-700">{libelleZoneGeographique(a.zoneGeographique)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <select
                          value={editActif ? "true" : "false"}
                          onChange={(e) => setEditActif(e.target.value === "true")}
                          className={`${inputClass} w-full min-w-[7rem] text-xs`}
                          aria-label={`Statut agence ${a._id}`}
                        >
                          <option value="true">Actif</option>
                          <option value="false">Inactif</option>
                        </select>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {a.actif ? (
                            <span className="w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                              Actif
                            </span>
                          ) : (
                            <span className="w-fit rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                              Inactif
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void patchAgenceActif(a, !a.actif)}
                            disabled={
                              editingId !== null ||
                              togglingActifId !== null ||
                              deletingId !== null ||
                              savingEditId !== null
                            }
                            className="w-fit rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                          >
                            {togglingActifId === a._id
                              ? "…"
                              : a.actif
                                ? "Rendre inactif"
                                : "Rendre actif"}
                          </button>
                        </div>
                      )}
                    </td>
                    <td
                      className="max-w-32 truncate px-3 py-2 align-top font-mono text-[10px] text-slate-500"
                      title={a._id}
                    >
                      {a._id}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={savingEditId !== null}
                            onClick={() => void saveEdit()}
                            className="rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {savingEditId === a._id ? "Enregistrement…" : "Enregistrer"}
                          </button>
                          <button
                            type="button"
                            disabled={savingEditId !== null}
                            onClick={cancelEdit}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(a)}
                            disabled={editingId !== null || deletingId !== null || togglingActifId !== null}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                            title={editingId !== null ? "Terminez l’édition en cours" : undefined}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => void requestDelete(a)}
                            disabled={editingId !== null || deletingId !== null || togglingActifId !== null}
                            className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-40"
                            title="Supprimer si l’agence n’est plus utilisée"
                          >
                            {deletingId === a._id ? "Suppression…" : "Supprimer"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
