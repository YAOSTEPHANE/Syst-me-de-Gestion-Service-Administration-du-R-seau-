"use client";

import { FormEvent, useEffect, useState } from "react";

export default function AlertThresholdsSettings() {
  const [visible, setVisible] = useState(false);
  const [cautionDays, setCautionDays] = useState(10);
  const [idleHours, setIdleHours] = useState(48);
  const [pdvDays, setPdvDays] = useState(5);
  const [agrementDays, setAgrementDays] = useState(7);
  const [successionDays, setSuccessionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/app-settings", { credentials: "include" });
        if (res.status === 403 || res.status === 401) {
          setVisible(false);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          alertCautionMaxDays: number;
          alertDossierIdleHours: number;
          alertPdvIntegrationMaxDays: number;
          alertAgrementStaleDays: number;
          alertSuccessionStaleDays: number;
        };
        setCautionDays(data.alertCautionMaxDays);
        setIdleHours(data.alertDossierIdleHours);
        setPdvDays(data.alertPdvIntegrationMaxDays);
        setAgrementDays(data.alertAgrementStaleDays);
        setSuccessionDays(data.alertSuccessionStaleDays);
        setVisible(true);
      } catch {
        setVisible(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertCautionMaxDays: cautionDays,
          alertDossierIdleHours: idleHours,
          alertPdvIntegrationMaxDays: pdvDays,
          alertAgrementStaleDays: agrementDays,
          alertSuccessionStaleDays: successionDays,
        }),
      });
      if (!res.ok) throw new Error();
      setMessage("Seuils enregistrés.");
    } catch {
      setMessage("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !visible) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Seuils d&apos;alerte (Chef(fe) de service)</h3>
      <p className="mt-1 text-xs text-slate-600">
        Paramètres de référence pour les indicateurs du tableau de bord et les futures relances automatiques.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-4 grid gap-3 rounded-xl border border-amber-200/70 bg-amber-50/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm text-slate-700">
          <span className="text-xs uppercase tracking-wide text-slate-500">Cautions : délai max (jours)</span>
          <input
            type="number"
            min={1}
            max={365}
            value={cautionDays}
            onChange={(e) => setCautionDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="block text-sm text-slate-700">
          <span className="text-xs uppercase tracking-wide text-slate-500">Dossiers sans action (heures)</span>
          <input
            type="number"
            min={1}
            max={168}
            value={idleHours}
            onChange={(e) => setIdleHours(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="block text-sm text-slate-700">
          <span className="text-xs uppercase tracking-wide text-slate-500">Intégration PDV : délai max (jours)</span>
          <input
            type="number"
            min={1}
            max={90}
            value={pdvDays}
            onChange={(e) => setPdvDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="block text-sm text-slate-700">
          <span className="text-xs uppercase tracking-wide text-slate-500">Agrément SOUMIS sans MAJ (jours)</span>
          <input
            type="number"
            min={1}
            max={90}
            value={agrementDays}
            onChange={(e) => setAgrementDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="block text-sm text-slate-700">
          <span className="text-xs uppercase tracking-wide text-slate-500">Succession sans activité (jours)</span>
          <input
            type="number"
            min={1}
            max={365}
            value={successionDays}
            onChange={(e) => setSuccessionDays(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded border border-amber-600 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Sauvegarder"}
          </button>
        </div>
      </form>
      {message ? <p className="mt-2 text-xs text-emerald-600">{message}</p> : null}
    </section>
  );
}
