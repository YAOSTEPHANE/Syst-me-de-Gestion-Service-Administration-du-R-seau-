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
    <ChecklistEditor
      title="Documents à fournir"
      description="Circuit documentaire strict avant la vérification juridique (étape 4)."
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
      isItemEditable={(entry) =>
        !(entry.itemId === "succession_acte_deces_officiel" && acteDecesPresent)
      }
      readOnlySuffix={(entry) =>
        entry.itemId === "succession_acte_deces_officiel" && acteDecesPresent && editable
          ? " (acte joint)"
          : null
      }
      className="border-orange-200 bg-orange-50/30"
    >
      {acteDecesPresent ? (
        <p className="mt-2 text-[10px] text-emerald-800">
          L&apos;acte de décès joint à l&apos;ouverture est pris en compte pour la première pièce.
        </p>
      ) : null}
    </ChecklistEditor>
  );
}
