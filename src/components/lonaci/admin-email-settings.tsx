"use client";

import { useEffect, useState } from "react";
import { Clock3, MailCheck, Save } from "lucide-react";

import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { FormField } from "@/components/lonaci/ui/form-field";
import { SectionHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
import { notify } from "@/lib/toast";

export default function AdminEmailSettings() {
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      notify.success("Paramètre enregistré.");
    } catch {
      notify.error("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTarget(next: number) {
    setSaving(true);
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
      notify.success("Objectif dashboard enregistré.");
    } catch {
      notify.error("Erreur lors de la sauvegarde de l'objectif.");
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
      notify.success("Paramètres d’export supervision enregistrés.");
    } catch {
      notify.error("Erreur lors de la sauvegarde de l’export supervision.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !visible) return null;

  return (
    <Surface elevated className="mt-6" aria-labelledby="email-settings-title">
      <SectionHeader
        title={<span id="email-settings-title" className="inline-flex items-center gap-2"><MailCheck size={19} className="text-orange-600" aria-hidden="true" />Paramètres email</span>}
        description="Réservé au Chef(fe) de service · Alertes workflow et exports de supervision."
      />
      <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-orange-200 bg-orange-50/50 p-4 text-sm font-medium text-slate-800">
        <span>
          <span className="block">Emails critiques</span>
          <span className="mt-1 block text-xs font-normal text-slate-600">Dossiers, résiliations et digest planifiés.</span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => {
            const v = e.target.checked;
            setEnabled(v);
            void save(v);
          }}
          className="h-5 w-5 accent-orange-600"
        />
      </label>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <FormField label="Objectif mensuel de contrats" htmlFor="dashboard-contract-target" hint="Valeur affichée sur le tableau de bord, de 1 à 10 000.">
          <div className="flex flex-wrap items-center gap-3">
          <input
            id="dashboard-contract-target"
            type="number"
            min={1}
            max={10000}
            value={target}
            disabled={saving}
            onChange={(e) => setTarget(Number(e.target.value) || 1)}
            className="min-h-11 w-32 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
          />
          <Button
            size="sm"
            variant="secondary"
            loading={saving}
            leadingIcon={Save}
            onClick={() => void saveTarget(target)}
          >
            Enregistrer
          </Button>
          </div>
        </FormField>
        </div>

      <div className="mt-4 rounded-2xl border border-orange-200 bg-linear-to-br from-orange-50 to-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-bold text-[#13213c]"><Clock3 size={17} className="text-orange-600" aria-hidden="true" />Export supervision planifié</p>
            <p className="mt-1 text-xs text-slate-600">Génération quotidienne selon l’heure UTC configurée.</p>
          </div>
          <StatusBadge tone={lastSupervisionStatus === "OK" ? "success" : lastSupervisionStatus === "ERROR" ? "danger" : "neutral"}>
            {lastSupervisionStatus ?? "Jamais exécuté"}
          </StatusBadge>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            checked={supervisionCronEnabled}
            disabled={saving}
            onChange={(e) => {
              const v = e.target.checked;
              setSupervisionCronEnabled(v);
              void saveSupervisionCron(v, supervisionFormat, supervisionHourUtc);
            }}
            className="h-5 w-5 accent-orange-600"
          />
          Activer la génération automatique
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label="Format d’envoi" htmlFor="supervision-export-format">
          <select
            id="supervision-export-format"
            value={supervisionFormat}
            disabled={saving}
            onChange={(e) => {
              const v = e.target.value as "pdf" | "csv" | "xlsx";
              setSupervisionFormat(v);
              void saveSupervisionCron(supervisionCronEnabled, v, supervisionHourUtc);
            }}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
          >
            <option value="pdf">PDF</option>
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
          </select>
          </FormField>
          <FormField label="Heure d’exécution UTC" htmlFor="supervision-export-hour" hint={`Exécution attendue à ${String(supervisionHourUtc).padStart(2, "0")}:00 UTC.`}>
          <div className="flex flex-wrap items-center gap-2">
          <input
            id="supervision-export-hour"
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
            className="min-h-11 w-24 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
          />
          <Button
            size="sm"
            variant="secondary"
            loading={saving}
            leadingIcon={Save}
            onClick={() => void saveSupervisionCron(supervisionCronEnabled, supervisionFormat, supervisionHourUtc)}
          >
            Enregistrer l’heure
          </Button>
          </div>
          </FormField>
        </div>
        <p className="mt-4 text-xs text-slate-600" aria-live="polite">
          Dernière exécution : {lastSupervisionRunAt ? new Date(lastSupervisionRunAt).toLocaleString("fr-FR") : "jamais"}
        </p>
      </div>
    </Surface>
  );
}
