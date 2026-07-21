"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save, ShieldAlert } from "lucide-react";

import { Button } from "@/components/lonaci/ui/button";
import { FormField } from "@/components/lonaci/ui/form-field";
import { SectionHeader } from "@/components/lonaci/ui/headers";
import { Surface } from "@/components/lonaci/ui/surface";
import { notify } from "@/lib/toast";

export default function AlertThresholdsSettings() {
  const [visible, setVisible] = useState(false);
  const [cautionDays, setCautionDays] = useState(10);
  const [idleHours, setIdleHours] = useState(48);
  const [pdvDays, setPdvDays] = useState(5);
  const [agrementDays, setAgrementDays] = useState(7);
  const [successionDays, setSuccessionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      notify.success("Seuils enregistrés.");
    } catch {
      notify.error("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !visible) return null;

  return (
    <Surface elevated aria-labelledby="alert-thresholds-title">
      <SectionHeader
        title={<span id="alert-thresholds-title" className="inline-flex items-center gap-2"><ShieldAlert size={19} className="text-orange-600" aria-hidden="true" />Seuils d&apos;alerte</span>}
        description="Réservé au Chef(fe) de service · Références des indicateurs et relances automatiques."
      />
      <form onSubmit={(e) => void onSubmit(e)} className="mt-5 grid gap-4 rounded-2xl border border-orange-200 bg-orange-50/40 p-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy={saving}>
        <FormField label="Cautions : délai maximal" htmlFor="alert-caution-days" hint="Nombre de jours, de 1 à 365.">
          <input
            id="alert-caution-days"
            type="number"
            min={1}
            max={365}
            value={cautionDays}
            onChange={(e) => setCautionDays(Number(e.target.value))}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
          />
        </FormField>
        <FormField label="Dossiers sans action" htmlFor="alert-idle-hours" hint="Nombre d’heures, de 1 à 168.">
          <input
            id="alert-idle-hours"
            type="number"
            min={1}
            max={168}
            value={idleHours}
            onChange={(e) => setIdleHours(Number(e.target.value))}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
          />
        </FormField>
        <FormField label="Intégration PDV : délai maximal" htmlFor="alert-pdv-days" hint="Nombre de jours, de 1 à 90.">
          <input
            id="alert-pdv-days"
            type="number"
            min={1}
            max={90}
            value={pdvDays}
            onChange={(e) => setPdvDays(Number(e.target.value))}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
          />
        </FormField>
        <FormField label="Agrément soumis sans mise à jour" htmlFor="alert-agrement-days" hint="Nombre de jours, de 1 à 90.">
          <input
            id="alert-agrement-days"
            type="number"
            min={1}
            max={90}
            value={agrementDays}
            onChange={(e) => setAgrementDays(Number(e.target.value))}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
          />
        </FormField>
        <FormField label="Succession sans activité" htmlFor="alert-succession-days" hint="Nombre de jours, de 1 à 365.">
          <input
            id="alert-succession-days"
            type="number"
            min={1}
            max={365}
            value={successionDays}
            onChange={(e) => setSuccessionDays(Number(e.target.value))}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
          />
        </FormField>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button
            type="submit"
            loading={saving}
            leadingIcon={Save}
          >
            {saving ? "Enregistrement…" : "Sauvegarder"}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
