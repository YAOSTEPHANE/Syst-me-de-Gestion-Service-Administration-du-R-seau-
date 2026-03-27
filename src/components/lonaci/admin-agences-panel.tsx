"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

interface AgenceRow {
  _id: string;
  code: string;
  libelle: string;
  actif: boolean;
}

export default function AdminAgencesPanel() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [agences, setAgences] = useState<AgenceRow[]>([]);
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [creating, setCreating] = useState(false);
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
        body: JSON.stringify({ code: c, libelle: l }),
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
      setSuccess(`Agence « ${body?.agence?.code ?? c} » créée.`);
    } catch {
      setError("Erreur réseau ou serveur.");
    } finally {
      setCreating(false);
    }
  }

  if (loading || !visible) return null;

  const inputClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-500/20 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-sm font-semibold text-slate-900">Agences (référentiel)</h3>
      <p className="mt-1 text-xs text-slate-600">
        Création réservée au <strong>chef de service</strong>. Le code est normalisé en majuscules (ex. pour les codes
        PDV). Les concessionnaires existants ne sont pas modifiés automatiquement.
      </p>

      <form
        onSubmit={onCreate}
        className="mt-4 grid gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
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
        <table className="w-full min-w-[420px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Libellé</th>
              <th className="px-3 py-2 font-semibold">Statut</th>
              <th className="px-3 py-2 font-mono font-normal text-slate-500">ID</th>
            </tr>
          </thead>
          <tbody className="text-slate-800">
            {agences.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  Aucune agence en base.
                </td>
              </tr>
            ) : (
              agences.map((a) => (
                <tr key={a._id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-2 font-mono font-medium">{a.code}</td>
                  <td className="px-3 py-2">{a.libelle}</td>
                  <td className="px-3 py-2">
                    {a.actif ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                        Actif
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                        Inactif
                      </span>
                    )}
                  </td>
                  <td className="max-w-32 truncate px-3 py-2 font-mono text-[10px] text-slate-500" title={a._id}>
                    {a._id}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
