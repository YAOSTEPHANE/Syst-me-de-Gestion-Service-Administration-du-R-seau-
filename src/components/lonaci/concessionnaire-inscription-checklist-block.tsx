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
  concessionnaireId: string;
  checklist: DossierDocumentChecklistPayload | null;
  editable: boolean;
  onUpdated: (checklist: DossierDocumentChecklistPayload) => void;
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

export default function ConcessionnaireInscriptionChecklistBlock({
  concessionnaireId,
  checklist,
  editable,
  onUpdated,
}: Props) {
  const [localStatuts, setLocalStatuts] = useState<Record<string, DossierDocumentChecklistStatut>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!checklist) {
      setLocalStatuts({});
      return;
    }
    const map: Record<string, DossierDocumentChecklistStatut> = {};
    for (const e of checklist.entries) {
      map[e.itemId] = e.statut;
    }
    setLocalStatuts(map);
  }, [checklist]);

  const progress = useMemo(() => {
    if (!checklist?.entries.length) {
      return { complet: true, obligatoiresFournis: 0, obligatoiresTotal: 0 };
    }
    return computeChecklistProgress(checklist.entries, localStatuts);
  }, [checklist, localStatuts]);

  const saveStatuts = useCallback(
    async (nextMap: Record<string, DossierDocumentChecklistStatut>) => {
      if (!checklist?.entries.length) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/concessionnaires/${concessionnaireId}`, {
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
          concessionnaire?: { documentChecklist?: DossierDocumentChecklistPayload | null };
        } | null;
        if (!res.ok || !body?.concessionnaire?.documentChecklist) {
          setError(friendlyErrorMessage(body?.message ?? "Enregistrement checklist impossible."));
          return;
        }
        onUpdated(body.concessionnaire.documentChecklist);
      } catch {
        setError("Enregistrement checklist impossible.");
      } finally {
        setSaving(false);
      }
    },
    [checklist, concessionnaireId, onUpdated],
  );

  if (!checklist?.entries.length) {
    return (
      <p className="text-xs text-slate-600">
        Aucune pièce configurée pour les produits sélectionnés (référentiel produits).
      </p>
    );
  }

  return (
    <ChecklistEditor
      title="Pièces justificatives (inscription)"
      description="Suivi des pièces issues du référentiel des produits sélectionnés."
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
      className="border-slate-200 bg-slate-50/80"
    />
  );
}
