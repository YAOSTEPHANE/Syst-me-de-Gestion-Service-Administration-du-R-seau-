"use client";

import DossierCompletIndicator from "@/components/lonaci/dossier-complet-indicator";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import {
  DOSSIER_CHECKLIST_STATUTS,
  DOSSIER_CHECKLIST_STATUT_LABELS,
  computeChecklistProgress,
} from "@/lib/lonaci/produit-document-checklist";
import type { DossierDocumentChecklistPayload, DossierDocumentChecklistStatut } from "@/lib/lonaci/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  caseId: string;
  checklist: DossierDocumentChecklistPayload;
  editable: boolean;
  acteDecesPresent: boolean;
  onUpdated: (checklist: DossierDocumentChecklistPayload) => void;
  onProgressChange?: (progress: {
    complet: boolean;
    obligatoiresFournis: number;
    obligatoiresTotal: number;
  }) => void;
};

function statutBadgeClass(statut: DossierDocumentChecklistStatut): string {
  switch (statut) {
    case "FOURNI":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "MANQUANT":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "EN_ATTENTE":
      return "bg-amber-100 text-amber-900 border-amber-200";
  }
}

export default function SuccessionChecklistBlock({
  caseId,
  checklist,
  editable,
  acteDecesPresent,
  onUpdated,
  onProgressChange,
}: Props) {
  const [localStatuts, setLocalStatuts] = useState<Record<string, DossierDocumentChecklistStatut>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const map: Record<string, DossierDocumentChecklistStatut> = {};
    for (const e of checklist.entries) {
      map[e.itemId] =
        e.itemId === "succession_acte_deces_officiel" && acteDecesPresent ? "FOURNI" : e.statut;
    }
    setLocalStatuts(map);
  }, [checklist, acteDecesPresent]);

  const progress = useMemo(
    () => computeChecklistProgress(checklist.entries, localStatuts),
    [checklist.entries, localStatuts],
  );

  useEffect(() => {
    onProgressChange?.(progress);
  }, [progress, onProgressChange]);

  const saveStatuts = useCallback(
    async (nextMap: Record<string, DossierDocumentChecklistStatut>) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/succession-cases/${encodeURIComponent(caseId)}/checklist`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentChecklist: checklist.entries.map((e) => ({
              itemId: e.itemId,
              statut: nextMap[e.itemId] ?? e.statut,
            })),
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          message?: string;
          case?: { documentChecklist?: DossierDocumentChecklistPayload };
        } | null;
        if (!res.ok || !body?.case?.documentChecklist) {
          setError(friendlyErrorMessage(body?.message ?? "Enregistrement checklist impossible."));
          return;
        }
        onUpdated(body.case.documentChecklist);
      } catch {
        setError("Enregistrement checklist impossible.");
      } finally {
        setSaving(false);
      }
    },
    [caseId, checklist.entries, onUpdated],
  );

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-900">
          10.1 — Checklist de documents à fournir
        </p>
        <DossierCompletIndicator
          complet={progress.complet}
          size="sm"
          live={editable}
          obligatoiresFournis={progress.obligatoiresFournis}
          obligatoiresTotal={progress.obligatoiresTotal}
        />
      </div>
      <p className="mt-1 text-[10px] leading-snug text-slate-600">
        Circuit documentaire strict avant la vérification juridique (étape 4).
      </p>
      {acteDecesPresent ? (
        <p className="mt-1 text-[10px] text-emerald-800">
          L&apos;acte de décès joint à l&apos;ouverture est pris en compte pour la première pièce.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      {saving ? <p className="mt-1 text-[10px] text-slate-500">Enregistrement…</p> : null}
      <ul className="mt-2 space-y-2">
        {checklist.entries.map((entry) => {
          const lockedActe =
            entry.itemId === "succession_acte_deces_officiel" && acteDecesPresent && editable;
          const statut = localStatuts[entry.itemId] ?? entry.statut;
          return (
            <li
              key={entry.itemId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/80 bg-white/90 px-2.5 py-2"
            >
              <span className="min-w-0 flex-1 text-xs text-slate-800">
                {entry.libelle}
                {entry.obligatoire ? <span className="text-rose-600"> *</span> : null}
              </span>
              {editable && !lockedActe ? (
                <select
                  value={statut}
                  disabled={saving}
                  onChange={(e) => {
                    const nextStatut = e.target.value as DossierDocumentChecklistStatut;
                    const next = { ...localStatuts, [entry.itemId]: nextStatut };
                    setLocalStatuts(next);
                    void saveStatuts(next);
                  }}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900"
                  aria-label={`Statut — ${entry.libelle}`}
                >
                  {DOSSIER_CHECKLIST_STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {DOSSIER_CHECKLIST_STATUT_LABELS[s]}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statutBadgeClass(statut)}`}
                >
                  {DOSSIER_CHECKLIST_STATUT_LABELS[statut]}
                  {lockedActe ? " (acte joint)" : ""}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
