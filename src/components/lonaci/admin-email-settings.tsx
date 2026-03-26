"use client";

import { useEffect, useState } from "react";

export default function AdminEmailSettings() {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(true);
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
        const data = (await res.json()) as { criticalWorkflowEmailEnabled: boolean };
        setEnabled(data.criticalWorkflowEmailEnabled);
        setVisible(true);
      } catch {
        setVisible(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(next: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criticalWorkflowEmailEnabled: next }),
      });
      if (!res.ok) throw new Error("Sauvegarde impossible");
      const data = (await res.json()) as { criticalWorkflowEmailEnabled: boolean };
      setEnabled(data.criticalWorkflowEmailEnabled);
      setMessage("Paramètre enregistré.");
    } catch {
      setMessage("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !visible) return null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Paramètres email (Chef(fe) de service)</h3>
      <p className="mt-1 text-xs text-slate-600">
        Active ou désactive l’envoi SMTP des alertes workflow (dossiers, résiliations, digest cron).
      </p>
      <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-sky-200/80 bg-sky-50/50 px-3 py-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => {
            const v = e.target.checked;
            setEnabled(v);
            void save(v);
          }}
        />
        Emails critiques activés
      </label>
      {message ? <p className="mt-2 text-xs text-emerald-600">{message}</p> : null}
    </section>
  );
}
