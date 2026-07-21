"use client";

import { ChecklistEditor } from "@/components/lonaci/workflow/checklist-editor";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import {
  DOSSIER_CHECKLIST_STATUTS,
  DOSSIER_CHECKLIST_STATUT_LABELS,
  computeChecklistProgress,
} from "@/lib/lonaci/produit-document-checklist";
import type { DossierDocumentChecklistPayload, DossierDocumentChecklistStatut } from "@/lib/lonaci/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  resiliationId: string;
  checklist: DossierDocumentChecklistPayload;
  editable: boolean;
  onUpdated: (checklist: DossierDocumentChecklistPayload) => void;
  onProgressChange?: (progress: {
    complet: boolean;
    obligatoiresFournis: number;
    obligatoiresTotal: number;
  }) => void;
};

function statutTone(statut: DossierDocumentChecklistStatut): "success" | "danger" | "warning" {
  switch (statut) {
    case "FOURNI":
      return "success";
    case "MANQUANT":
      return "danger";
    case "EN_ATTENTE":
      return "warning";
  }
}

export default function ResiliationChecklistBlock({
  resiliationId,
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
        const res = await fetch(`/api/resiliations/${encodeURIComponent(resiliationId)}`, {
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
    [resiliationId, checklist.entries, onUpdated],
  );

  return (
    <ChecklistEditor
      title="Documents à fournir"
      description="Dossier complet requis avant traitement de la résiliation."
      entries={checklist.entries}
      statuses={DOSSIER_CHECKLIST_STATUTS}
      statusLabels={DOSSIER_CHECKLIST_STATUT_LABELS}
      statusTone={statutTone}
      localStatuses={localStatuts}
      progress={progress}
      editable={editable}
      saving={saving}
      error={error}
      onStatusChange={(itemId, statut) => {
        const next = { ...localStatuts, [itemId]: statut };
        setLocalStatuts(next);
        void saveStatuts(next);
      }}
      className="border-orange-200 bg-orange-50/30"
    />
  );
}
