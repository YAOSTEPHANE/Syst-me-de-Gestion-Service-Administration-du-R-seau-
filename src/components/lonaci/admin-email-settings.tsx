"use client";

import { useEffect, useState } from "react";

export default function AdminEmailSettings() {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [target, setTarget] = useState(20);
  const [supervisionCronEnabled, setSupervisionCronEnabled] = useState(false);
  const [supervisionFormat, setSupervisionFormat] = useState<"pdf" | "csv" | "xlsx">("pdf");
  const [supervisionHourUtc, setSupervisionHourUtc] = useState(6);
  const [lastSupervisionRunAt, setLastSupervisionRunAt] = useState<string | null>(null);
  const [lastSupervisionStatus, setLastSupervisionStatus] = useState<"OK" | "ERROR" | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!meRes.ok) {
          setVisible(false);
          return;
        }
        const me = (await meRes.json()) as { user?: { role?: string } };
        if (me.user?.role !== "CHEF_SERVICE") {
          setVisible(false);
          return;
        }
        const res = await fetch("/api/admin/app-settings", { credentials: "include" });
        if (res.status === 403 || res.status === 401) {
          setVisible(false);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          criticalWorkflowEmailEnabled: boolean;
          supervisionExportCronEnabled?: boolean;
          supervisionExportFormat?: "pdf" | "csv" | "xlsx";
          supervisionExportCronHourUtc?: number;
          supervisionExportLastRunAt?: string | null;
          supervisionExportLastStatus?: "OK" | "ERROR" | null;
          dashboardContractsMonthlyTarget?: number;
        };
        setEnabled(data.criticalWorkflowEmailEnabled);
        setSupervisionCronEnabled(data.supervisionExportCronEnabled ?? false);
        setSupervisionFormat(data.supervisionExportFormat ?? "pdf");
        setSupervisionHourUtc(data.supervisionExportCronHourUtc ?? 6);
        setLastSupervisionRunAt(data.supervisionExportLastRunAt ?? null);
        setLastSupervisionStatus(data.supervisionExportLastStatus ?? null);
        setTarget(data.dashboardContractsMonthlyTarget ?? 20);
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

  async function saveTarget(next: number) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboardContractsMonthlyTarget: next }),
      });
      if (!res.ok) throw new Error("Sauvegarde impossible");
      const data = (await res.json()) as { dashboardContractsMonthlyTarget?: number };
      setTarget(data.dashboardContractsMonthlyTarget ?? next);
      setMessage("Objectif dashboard enregistré.");
    } catch {
      setMessage("Erreur lors de la sauvegarde de l'objectif.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSupervisionCron(
    nextEnabled: boolean,
    nextFormat: "pdf" | "csv" | "xlsx",
    nextHourUtc: number,
  ) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supervisionExportCronEnabled: nextEnabled,
          supervisionExportFormat: nextFormat,
          supervisionExportCronHourUtc: nextHourUtc,
        }),
      });
      if (!res.ok) throw new Error("Sauvegarde impossible");
      const data = (await res.json()) as {
        supervisionExportCronEnabled?: boolean;
        supervisionExportFormat?: "pdf" | "csv" | "xlsx";
        supervisionExportCronHourUtc?: number;
        supervisionExportLastRunAt?: string | null;
        supervisionExportLastStatus?: "OK" | "ERROR" | null;
      };
      setSupervisionCronEnabled(data.supervisionExportCronEnabled ?? nextEnabled);
      setSupervisionFormat(data.supervisionExportFormat ?? nextFormat);
      setSupervisionHourUtc(data.supervisionExportCronHourUtc ?? nextHourUtc);
      setLastSupervisionRunAt(data.supervisionExportLastRunAt ?? null);
      setLastSupervisionStatus(data.supervisionExportLastStatus ?? null);
      setMessage("Parametres export supervision enregistres.");
    } catch {
      setMessage("Erreur lors de la sauvegarde de l'export supervision.");
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
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="mb-2 text-xs text-slate-600">Objectif mensuel contrats (dashboard)</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            aria-label="Objectif mensuel contrats"
            min={1}
            max={10000}
            value={target}
            disabled={saving}
            onChange={(e) => setTarget(Number(e.target.value) || 1)}
            className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveTarget(target)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
        <p className="mb-2 text-xs font-semibold text-violet-800">Export supervision planifie (cron journalier)</p>
        <label className="inline-flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={supervisionCronEnabled}
            disabled={saving}
            onChange={(e) => {
              const v = e.target.checked;
              setSupervisionCronEnabled(v);
              void saveSupervisionCron(v, supervisionFormat, supervisionHourUtc);
            }}
          />
          Activer la generation automatique
        </label>
        <div className="mt-2 flex items-center gap-2">
          <select
            value={supervisionFormat}
            disabled={saving}
            onChange={(e) => {
              const v = e.target.value as "pdf" | "csv" | "xlsx";
              setSupervisionFormat(v);
              void saveSupervisionCron(supervisionCronEnabled, v, supervisionHourUtc);
            }}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            aria-label="Format export supervision planifie"
          >
            <option value="pdf">PDF</option>
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
          </select>
          <span className="text-xs text-slate-600">Format envoi automatique</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={23}
            value={supervisionHourUtc}
            disabled={saving}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const next = Number.isFinite(raw) ? Math.min(23, Math.max(0, raw)) : 6;
              setSupervisionHourUtc(next);
            }}
            className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            aria-label="Heure UTC execution supervision"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveSupervisionCron(supervisionCronEnabled, supervisionFormat, supervisionHourUtc)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Sauver heure UTC
          </button>
          <span className="text-xs text-slate-600">Execution attendue a {String(supervisionHourUtc).padStart(2, "0")}:00 UTC</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          Dernier run: {lastSupervisionRunAt ? new Date(lastSupervisionRunAt).toLocaleString("fr-FR") : "jamais"} | Statut:{" "}
          {lastSupervisionStatus ?? "N/A"}
        </p>
      </div>
      {message ? <p className="mt-2 text-xs text-emerald-600">{message}</p> : null}
    </section>
  );
}
