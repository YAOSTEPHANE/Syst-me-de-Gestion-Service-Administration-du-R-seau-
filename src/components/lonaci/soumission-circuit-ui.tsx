"use client";

import { useState, type FormEvent } from "react";
import { BadgeCheck, FileCheck2, Send, ShieldOff, Undo2 } from "lucide-react";

import { StatusBadge } from "@/components/lonaci/ui/badge";
import { Button } from "@/components/lonaci/ui/button";
import { Dialog } from "@/components/lonaci/ui/dialog";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { FormField } from "@/components/lonaci/ui/form-field";
import {
  CAUTION_ENCAISSEMENT_MODE_LABELS,
  CAUTION_ENCAISSEMENT_MODES,
  type CautionEncaissementMode,
} from "@/lib/lonaci/constants";
import {
  resolveSoumissionCircuitAffichage,
  SOUMISSION_CIRCUIT_LABELS,
  SOUMISSION_CIRCUIT_TAB_LABELS,
  SOUMISSION_CIRCUIT_TABS,
  type SoumissionCircuitActions,
  type SoumissionCircuitAffichage,
  type SoumissionCircuitCounters,
  type SoumissionCircuitStatut,
  type SoumissionCircuitTab,
} from "@/lib/lonaci/soumission-circuit";
import { notify } from "@/lib/toast";

export type SoumissionCircuitItem = {
  id: string;
  nomComplet: string;
  circuitStatut: SoumissionCircuitStatut | null;
  circuitStartedAt: string | null;
  circuitMotif: string | null;
  numeroFicheDefinitive: string | null;
  circuitActions?: SoumissionCircuitActions;
};

export type SoumissionCircuitDialogMode = "FINALISER" | "RETOUR_CORRECTION" | "EXONERER" | "RENVOYER";

function affichageClass(affichage: SoumissionCircuitAffichage): string {
  switch (affichage) {
    case "EN_ATTENTE":
      return "bg-violet-50 text-violet-900";
    case "A_CORRIGER":
      return "bg-amber-50 text-amber-900";
    case "EN_RETARD":
      return "bg-rose-50 text-rose-900";
    case "PAYEE":
      return "bg-emerald-50 text-emerald-900";
    case "ANNULEE":
      return "bg-slate-100 text-slate-700";
    case "EXONEREE":
      return "bg-teal-50 text-teal-900";
    default: {
      const exhaustive: never = affichage;
      return exhaustive;
    }
  }
}

export function SoumissionCircuitBadge({ item }: { item: SoumissionCircuitItem }) {
  const affichage = resolveSoumissionCircuitAffichage({
    circuitStatut: item.circuitStatut,
    circuitStartedAt: item.circuitStartedAt,
    now: new Date(),
  });
  if (!affichage) return <span className="text-xs text-slate-400">Fiche caisse non émise</span>;
  return (
    <StatusBadge className={affichageClass(affichage)} title={item.circuitMotif ?? undefined}>
      {SOUMISSION_CIRCUIT_LABELS[affichage]}
    </StatusBadge>
  );
}

export function SoumissionCircuitTabs({
  value,
  counters,
  onChange,
}: {
  value: SoumissionCircuitTab;
  counters: SoumissionCircuitCounters | null;
  onChange: (tab: SoumissionCircuitTab) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-white/80 p-1.5 shadow-sm"
      role="tablist"
      aria-label="Circuit de validation des soumissions"
      aria-orientation="horizontal"
    >
      {SOUMISSION_CIRCUIT_TABS.map((tab) => {
        const active = tab === value;
        const count = tab === "TOUTES" ? null : (counters?.[tab] ?? null);
        const alert = tab === "J10_OVERDUE" && (count ?? 0) > 0;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
              active ? "bg-[#102a43] text-white shadow-md" : "text-slate-600 hover:bg-orange-50 hover:text-[#102a43]"
            }`}
          >
            {SOUMISSION_CIRCUIT_TAB_LABELS[tab]}
            {count !== null ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  alert
                    ? "bg-rose-600 text-white"
                    : active
                      ? "bg-white/20 text-white"
                      : "bg-slate-100 text-slate-700"
                }`}
              >
                {count.toLocaleString("fr-FR")}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SoumissionCircuitButtons({
  item,
  onOpen,
}: {
  item: SoumissionCircuitItem;
  onOpen: (item: SoumissionCircuitItem, mode: SoumissionCircuitDialogMode) => void;
}) {
  const actions = item.circuitActions;
  if (!actions) return null;
  return (
    <>
      {actions.finaliser ? (
        <Button size="sm" leadingIcon={BadgeCheck} onClick={() => onOpen(item, "FINALISER")}>
          Finaliser
        </Button>
      ) : null}
      {actions.correction ? (
        <Button size="sm" variant="secondary" leadingIcon={Undo2} onClick={() => onOpen(item, "RETOUR_CORRECTION")}>
          Correction
        </Button>
      ) : null}
      {actions.exonerer ? (
        <Button size="sm" variant="secondary" leadingIcon={ShieldOff} onClick={() => onOpen(item, "EXONERER")}>
          Exonérer
        </Button>
      ) : null}
      {actions.renvoyer ? (
        <Button size="sm" leadingIcon={Send} onClick={() => onOpen(item, "RENVOYER")}>
          Renvoyer en validation
        </Button>
      ) : null}
      {actions.ficheDefinitive ? (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={FileCheck2}
          title={item.numeroFicheDefinitive ?? undefined}
          onClick={() =>
            window.open(
              `/api/soumissions/${encodeURIComponent(item.id)}/fiche-definitive/pdf`,
              "_blank",
              "noopener,noreferrer",
            )
          }
        >
          Fiche définitive
        </Button>
      ) : null}
    </>
  );
}

const DIALOG_COPY: Record<SoumissionCircuitDialogMode, { title: string; description: string; submit: string }> = {
  FINALISER: {
    title: "Finaliser la soumission",
    description: "Validez le paiement (fiche définitive émise) ou annulez la soumission.",
    submit: "Valider la décision",
  },
  RETOUR_CORRECTION: {
    title: "Retourner pour correction",
    description: "L'agent émetteur sera notifié avec votre motif.",
    submit: "Retourner",
  },
  EXONERER: {
    title: "Exonérer la soumission",
    description: "Décision de la Direction : la soumission est close sans paiement.",
    submit: "Exonérer",
  },
  RENVOYER: {
    title: "Renvoyer en validation",
    description: "La soumission corrigée repart chez le chef de service.",
    submit: "Renvoyer",
  },
};

export function SoumissionCircuitDialog({
  target,
  onClose,
  onDone,
}: {
  target: { item: SoumissionCircuitItem; mode: SoumissionCircuitDialogMode } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [decision, setDecision] = useState<"PAYEE" | "ANNULEE">("PAYEE");
  const [paymentMode, setPaymentMode] = useState<CautionEncaissementMode>("ESPECES");
  const [paymentReference, setPaymentReference] = useState("");
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDecision("PAYEE");
    setPaymentMode("ESPECES");
    setPaymentReference("");
    setMotif("");
    setError(null);
  }

  function close() {
    if (saving) return;
    reset();
    onClose();
  }

  if (!target) return null;
  const { item, mode } = target;
  const copy = DIALOG_COPY[mode];
  const needsMotif = mode === "RETOUR_CORRECTION" || mode === "EXONERER" || (mode === "FINALISER" && decision === "ANNULEE");

  function buildBody(): Record<string, string> {
    switch (mode) {
      case "FINALISER":
        return decision === "PAYEE"
          ? { action: "FINALISER_PAYEE", paymentMode, paymentReference: paymentReference.trim() }
          : { action: "ANNULER", motif: motif.trim() };
      case "RETOUR_CORRECTION":
        return { action: "RETOUR_CORRECTION", motif: motif.trim() };
      case "EXONERER":
        return { action: "EXONERER", motif: motif.trim() };
      case "RENVOYER":
        return { action: "RENVOYER" };
      default: {
        const exhaustive: never = mode;
        return exhaustive;
      }
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/soumissions/${encodeURIComponent(item.id)}/circuit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Action impossible");
      notify.success(`${copy.title} : ${item.nomComplet}`);
      reset();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={copy.title}
      description={`${item.nomComplet} — ${copy.description}`}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={close}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="soumission-circuit-form"
            loading={saving}
            variant={mode === "FINALISER" && decision === "ANNULEE" ? "danger" : "primary"}
          >
            {copy.submit}
          </Button>
        </>
      }
    >
      {error ? <FeedbackState tone="danger" title="Action impossible" description={error} /> : null}
      <form id="soumission-circuit-form" className="grid gap-4" onSubmit={(e) => void onSubmit(e)}>
        {mode === "FINALISER" ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold text-slate-700">Décision</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="decision"
                checked={decision === "PAYEE"}
                onChange={() => setDecision("PAYEE")}
              />
              Paiement confirmé (fiche définitive)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="decision"
                checked={decision === "ANNULEE"}
                onChange={() => setDecision("ANNULEE")}
              />
              Annuler la soumission
            </label>
          </fieldset>
        ) : null}

        {mode === "FINALISER" && decision === "PAYEE" ? (
          <>
            <FormField label="Mode de paiement" required>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as CautionEncaissementMode)}
              >
                {CAUTION_ENCAISSEMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {CAUTION_ENCAISSEMENT_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Référence de paiement" hint="N° du reçu caisse ou de la transaction." required>
              <input
                required
                minLength={3}
                maxLength={120}
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                data-autofocus
              />
            </FormField>
          </>
        ) : null}

        {needsMotif ? (
          <FormField label="Motif" required>
            <textarea
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
            />
          </FormField>
        ) : null}

        {mode === "RENVOYER" && item.circuitMotif ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Motif de correction : {item.circuitMotif}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
