"use client";

import { useMemo, useState } from "react";

import DossierCompletIndicator from "@/components/lonaci/dossier-complet-indicator";
import { Button } from "@/components/lonaci/ui/button";
import { Surface } from "@/components/lonaci/ui/surface";
import { downloadLonaciPdf } from "@/lib/lonaci/download-pdf";
import {
  DOSSIER_CHECKLIST_STATUTS,
  DOSSIER_CHECKLIST_STATUT_LABELS,
  computeChecklistProgress,
} from "@/lib/lonaci/produit-document-checklist";
import type { DossierDocumentChecklistPayload, DossierDocumentChecklistStatut } from "@/lib/lonaci/types";

function statutBadgeClass(statut: DossierDocumentChecklistStatut): string {
  switch (statut) {
    case "FOURNI":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "MANQUANT":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "EN_ATTENTE":
      return "bg-amber-100 text-amber-900 border-amber-200";
    default: {
      const exhaustiveStatut: never = statut;
      return exhaustiveStatut;
    }
  }
}

function buildStatutMap(checklist: DossierDocumentChecklistPayload): Record<string, DossierDocumentChecklistStatut> {
  const map: Record<string, DossierDocumentChecklistStatut> = {};
  for (const e of checklist.entries) {
    map[e.itemId] = e.statut;
  }
  return map;
}

type Props = {
  checklist: DossierDocumentChecklistPayload;
  editable?: boolean;
  onChange?: (next: DossierDocumentChecklistPayload) => void;
  pdfUrl?: string | null;
  className?: string;
  title?: string;
  hint?: string;
};

export default function ProduitDocumentChecklistEditor({
  checklist,
  editable = true,
  onChange,
  pdfUrl,
  className = "",
  title = "Checklist documents",
  hint = "Marquez chaque pièce : Fourni, Manquant ou En attente. Les pièces obligatoires doivent être « Fourni » pour un dossier complet.",
}: Props) {
  const checklistVersion = useMemo(
    () => checklist.entries.map((e) => `${e.itemId}:${e.statut}:${e.libelle}`).join("|"),
    [checklist.entries],
  );
  const [syncedVersion, setSyncedVersion] = useState(checklistVersion);
  const [localStatuts, setLocalStatuts] = useState(() => buildStatutMap(checklist));

  if (syncedVersion !== checklistVersion) {
    setSyncedVersion(checklistVersion);
    setLocalStatuts(buildStatutMap(checklist));
  }

  const progress = useMemo(() => {
    if (!checklist.entries.length) {
      return { complet: true, obligatoiresFournis: 0, obligatoiresTotal: 0 };
    }
    return computeChecklistProgress(checklist.entries, localStatuts);
  }, [checklist.entries, localStatuts]);

  function applyStatut(itemId: string, statut: DossierDocumentChecklistStatut) {
    const nextMap = { ...localStatuts, [itemId]: statut };
    setLocalStatuts(nextMap);
    if (!onChange) return;
    const entries = checklist.entries.map((entry) => ({
      ...entry,
      statut: nextMap[entry.itemId] ?? entry.statut,
    }));
    const obligatoires = entries.filter((e) => e.obligatoire);
    const fournis = obligatoires.filter((e) => e.statut === "FOURNI").length;
    onChange({
      entries,
      complet: obligatoires.length === 0 || fournis === obligatoires.length,
    });
  }

  if (!checklist.entries.length) {
    return (
      <Surface
        padding="sm"
        className={`border-dashed border-slate-200 bg-slate-50 ${className}`}
      >
        <p className="text-xs text-slate-600">
          Aucune checklist configurée pour ce produit. Paramétrez les pièces dans{" "}
          <span className="font-medium">Paramètres → Produits</span>.
        </p>
      </Surface>
    );
  }

  return (
    <Surface padding="sm" className={className}>
      <DossierCompletIndicator
        complet={progress.complet}
        size="banner"
        live={editable}
        obligatoiresFournis={progress.obligatoiresFournis}
        obligatoiresTotal={progress.obligatoiresTotal}
        className="mb-3"
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p>
          {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DossierCompletIndicator
            complet={progress.complet}
            size="sm"
            live={editable}
            obligatoiresFournis={progress.obligatoiresFournis}
            obligatoiresTotal={progress.obligatoiresTotal}
          />
          {pdfUrl ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void downloadLonaciPdf(pdfUrl, "checklist-contrat.pdf")}
              className="text-xs"
            >
              PDF checklist
            </Button>
          ) : null}
        </div>
      </div>

      <ul className="space-y-2">
        {checklist.entries.map((entry) => {
          const statut = localStatuts[entry.itemId] ?? entry.statut;
          return (
            <li
              key={entry.itemId}
              className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{entry.libelle}</p>
                {entry.obligatoire ? (
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Obligatoire</p>
                ) : (
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Facultatif</p>
                )}
              </div>
              {editable ? (
                <div className="flex flex-wrap gap-1">
                  {DOSSIER_CHECKLIST_STATUTS.map((s) => (
                    <Button
                      key={s}
                      variant="secondary"
                      size="sm"
                      onClick={() => applyStatut(entry.itemId, s)}
                      className={`min-h-0 px-2 py-1 text-[11px] ${
                        statut === s ? statutBadgeClass(s) : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {DOSSIER_CHECKLIST_STATUT_LABELS[s]}
                    </Button>
                  ))}
                </div>
              ) : (
                <span className={`rounded-md border px-2 py-1 text-[11px] font-medium ${statutBadgeClass(statut)}`}>
                  {DOSSIER_CHECKLIST_STATUT_LABELS[statut]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}
