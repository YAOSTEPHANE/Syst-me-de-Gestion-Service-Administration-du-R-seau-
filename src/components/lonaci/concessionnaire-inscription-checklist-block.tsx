"use client";

import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import {
  DOSSIER_CHECKLIST_STATUTS,
  DOSSIER_CHECKLIST_STATUT_LABELS,
} from "@/lib/lonaci/produit-document-checklist";
import type { DossierDocumentChecklistPayload, DossierDocumentChecklistStatut } from "@/lib/lonaci/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  concessionnaireId: string;
  checklist: DossierDocumentChecklistPayload | null;
  editable: boolean;
  onUpdated: (checklist: DossierDocumentChecklistPayload) => void;
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

  const complet = useMemo(() => {
    if (!checklist?.entries.length) return true;
    return checklist.entries.every((e) => !e.obligatoire || localStatuts[e.itemId] === "FOURNI");
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
    <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Pièces justificatives (inscription)
        </p>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            complet ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {complet ? "Complet" : "Incomplet"}
        </span>
      </div>
      {error ? <p className="mb-2 text-xs text-rose-700">{error}</p> : null}
      <ul className="space-y-2">
        {checklist.entries.map((entry) => (
          <li
            key={entry.itemId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-900">{entry.libelle}</p>
              <p className="text-[10px] text-slate-500">{entry.obligatoire ? "Obligatoire" : "Facultatif"}</p>
            </div>
            {editable ? (
              <select
                value={localStatuts[entry.itemId] ?? entry.statut}
                disabled={saving}
                onChange={(e) => {
                  const statut = e.target.value as DossierDocumentChecklistStatut;
                  const next = { ...localStatuts, [entry.itemId]: statut };
                  setLocalStatuts(next);
                  void saveStatuts(next);
                }}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800"
              >
                {DOSSIER_CHECKLIST_STATUTS.map((s) => (
                  <option key={s} value={s}>
                    {DOSSIER_CHECKLIST_STATUT_LABELS[s]}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statutBadgeClass(
                  localStatuts[entry.itemId] ?? entry.statut,
                )}`}
              >
                {DOSSIER_CHECKLIST_STATUT_LABELS[localStatuts[entry.itemId] ?? entry.statut]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
