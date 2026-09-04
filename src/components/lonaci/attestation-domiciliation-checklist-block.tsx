"use client";

import { CheckCircle2, CircleDashed } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/lonaci/ui/badge";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { Surface } from "@/components/lonaci/ui/surface";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import { computeChecklistProgress } from "@/lib/lonaci/produit-document-checklist";
import type { DossierDocumentChecklistPayload, DossierDocumentChecklistStatut } from "@/lib/lonaci/types";

type Props = {
  demandeId: string;
  checklist: DossierDocumentChecklistPayload;
  editable: boolean;
  onUpdated: (checklist: DossierDocumentChecklistPayload) => void;
  onProgressChange?: (progress: {
    complet: boolean;
    obligatoiresFournis: number;
    obligatoiresTotal: number;
  }) => void;
};

export default function AttestationDomiciliationChecklistBlock({
  demandeId,
  checklist,
  editable,
  onUpdated,
  onProgressChange,
}: Props) {
  const [localStatuts, setLocalStatuts] = useState<Record<string, DossierDocumentChecklistStatut>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const map: Record<string, DossierDocumentChecklistStatut> = {};
    for (const e of checklist.entries) {
      map[e.itemId] = e.statut;
    }
    setLocalStatuts(map);
  }, [checklist]);

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
        const res = await fetch(`/api/attestations-domiciliation/${encodeURIComponent(demandeId)}`, {
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
          item?: { documentChecklist?: DossierDocumentChecklistPayload | null };
        } | null;
        if (!res.ok || !body?.item?.documentChecklist) {
          setError(friendlyErrorMessage(body?.message ?? "Enregistrement checklist impossible."));
          return;
        }
        onUpdated(body.item.documentChecklist);
      } catch {
        setError("Enregistrement checklist impossible.");
      } finally {
        setSaving(false);
      }
    },
    [demandeId, checklist.entries, onUpdated],
  );

  const toggleFourni = (itemId: string, checked: boolean) => {
    const next = {
      ...localStatuts,
      [itemId]: checked ? ("FOURNI" as const) : ("EN_ATTENTE" as const),
    };
    setLocalStatuts(next);
    void saveStatuts(next);
  };

  const obligatoires = checklist.entries.filter((e) => e.obligatoire !== false);

  return (
    <Surface className="border-cyan-200 bg-cyan-50/30" padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Documents à fournir
          </p>
          <p className="mt-1 text-[10px] leading-snug text-slate-600">
            {editable
              ? "Cochez chaque pièce remise par le client. Dossier complet requis avant transmission au DFC."
              : "État des pièces du dossier."}
          </p>
        </div>
        <StatusBadge tone={progress.complet ? "success" : "warning"}>
          {progress.complet ? "Dossier complet" : "Dossier incomplet"}
        </StatusBadge>
      </div>

      <div className="mt-3" aria-label={`Progression : ${progress.obligatoiresFournis} sur ${progress.obligatoiresTotal} pièces obligatoires`}>
        <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-medium text-slate-600">
          <span>Progression des pièces obligatoires</span>
          <span>
            {progress.obligatoiresFournis}/{progress.obligatoiresTotal} cochée
            {progress.obligatoiresTotal !== 1 ? "s" : ""}
          </span>
        </div>
        <progress
          className="h-2 w-full overflow-hidden rounded-full accent-emerald-600"
          max={Math.max(progress.obligatoiresTotal, 1)}
          value={progress.obligatoiresTotal === 0 ? 1 : progress.obligatoiresFournis}
        />
      </div>

      {error ? (
        <FeedbackState className="mt-3" tone="danger" title="Enregistrement impossible" description={error} />
      ) : null}
      {saving ? (
        <p className="mt-2 text-xs font-medium text-cyan-800" role="status">
          Enregistrement…
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {checklist.entries.map((entry) => {
          const statut = localStatuts[entry.itemId] ?? entry.statut;
          const checked = statut === "FOURNI";
          const inputId = `attest-domic-check-${demandeId}-${entry.itemId}`;

          if (editable) {
            return (
              <li key={entry.itemId}>
                <label
                  htmlFor={inputId}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50/40"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    disabled={saving}
                    onChange={(e) => toggleFourni(entry.itemId, e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="min-w-0 flex-1 text-xs font-medium text-slate-900">
                    {entry.libelle}
                    {entry.obligatoire !== false ? (
                      <span className="ml-1 text-[10px] font-semibold text-rose-700">*</span>
                    ) : (
                      <span className="ml-1 text-[10px] text-slate-500">(facultatif)</span>
                    )}
                  </span>
                </label>
              </li>
            );
          }

          return (
            <li
              key={entry.itemId}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              {checked ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 text-xs font-medium text-slate-900">
                {entry.libelle}
                <span className="mt-1 block text-[10px] font-normal text-slate-500">
                  {checked ? "Fourni" : statut === "MANQUANT" ? "Manquant" : "En attente"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {editable && obligatoires.length > 0 ? (
        <p className="mt-3 text-[10px] text-slate-500">
          <span className="font-semibold text-rose-700">*</span> Pièce obligatoire
        </p>
      ) : null}
    </Surface>
  );
}
