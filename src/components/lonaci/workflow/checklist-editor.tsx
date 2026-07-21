"use client";

import { CheckCircle2, CircleDashed, CircleX } from "lucide-react";
import { useId, type ReactNode } from "react";

import { StatusBadge, type Tone } from "@/components/lonaci/ui/badge";
import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { Surface } from "@/components/lonaci/ui/surface";
import { cn } from "@/lib/ui/cn";

export type ChecklistProgress = {
  complet: boolean;
  obligatoiresFournis: number;
  obligatoiresTotal: number;
};

export type ChecklistEditorItem<TStatus extends string> = {
  itemId: string;
  libelle: string;
  obligatoire: boolean;
  statut: TStatus;
};

export interface ChecklistEditorProps<TStatus extends string> {
  title: ReactNode;
  description?: ReactNode;
  entries: readonly ChecklistEditorItem<TStatus>[];
  statuses: readonly TStatus[];
  statusLabels: Readonly<Record<TStatus, string>>;
  statusTone: (status: TStatus) => Extract<Tone, "success" | "warning" | "danger">;
  localStatuses: Readonly<Record<string, TStatus>>;
  progress: ChecklistProgress;
  editable: boolean;
  saving: boolean;
  error?: string | null;
  onStatusChange: (itemId: string, status: TStatus) => void;
  isItemEditable?: (item: ChecklistEditorItem<TStatus>) => boolean;
  readOnlySuffix?: (item: ChecklistEditorItem<TStatus>) => ReactNode;
  headerActions?: ReactNode;
  children?: ReactNode;
  className?: string;
  embedded?: boolean;
  showRequiredLabel?: boolean;
}

function StatusIcon({ tone }: { tone: Extract<Tone, "success" | "warning" | "danger"> }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "danger" ? CircleX : CircleDashed;
  return <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

function progressLabel(progress: ChecklistProgress): string {
  const plural = progress.obligatoiresTotal > 1 ? "s" : "";
  return `${progress.obligatoiresFournis} sur ${progress.obligatoiresTotal} pièce${plural} obligatoire${plural} fournie${plural}`;
}

export function ChecklistEditor<TStatus extends string>({
  title,
  description,
  entries,
  statuses,
  statusLabels,
  statusTone,
  localStatuses,
  progress,
  editable,
  saving,
  error,
  onStatusChange,
  isItemEditable,
  readOnlySuffix,
  headerActions,
  children,
  className,
  embedded = false,
  showRequiredLabel = true,
}: ChecklistEditorProps<TStatus>) {
  const idPrefix = useId();
  const percent =
    progress.obligatoiresTotal === 0
      ? 100
      : Math.round((progress.obligatoiresFournis / progress.obligatoiresTotal) * 100);
  const label = progressLabel(progress);

  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">{title}</p>
          {description ? <p className="mt-1 text-[10px] leading-snug text-slate-600">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={progress.complet ? "success" : "warning"}>
            {progress.complet ? "Dossier complet" : "Dossier incomplet"}
          </StatusBadge>
          {headerActions}
        </div>
      </div>

      <div className="mt-3" aria-label={`Progression de la checklist : ${label}`}>
        <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-medium text-slate-600">
          <span>Progression des pièces obligatoires</span>
          <span aria-hidden="true">{label}</span>
        </div>
        <progress
          className="h-2 w-full overflow-hidden rounded-full accent-emerald-600"
          max={Math.max(progress.obligatoiresTotal, 1)}
          value={progress.obligatoiresTotal === 0 ? 1 : progress.obligatoiresFournis}
        >
          {percent} %
        </progress>
      </div>

      <p className="lonaci-ui-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {label}. {progress.complet ? "Dossier complet." : "Dossier incomplet."}
        {saving ? " Enregistrement en cours." : ""}
      </p>

      {children}
      {error ? (
        <FeedbackState
          className="mt-3"
          tone="danger"
          title="Enregistrement impossible"
          description={error}
        />
      ) : null}
      {saving ? (
        <p className="mt-2 text-xs font-medium text-orange-700" role="status">
          Enregistrement…
        </p>
      ) : null}

      <ul className="mt-3 space-y-2 md:space-y-0 md:overflow-hidden md:rounded-xl md:border md:border-slate-200">
        {entries.map((entry, index) => {
          const status = localStatuses[entry.itemId] ?? entry.statut;
          const canEdit = editable && (isItemEditable?.(entry) ?? true);
          const selectId = `${idPrefix}-status-${index}`;
          return (
            <li
              key={entry.itemId}
              className={cn(
                "rounded-xl border border-slate-200 bg-white p-3 shadow-sm",
                "md:grid md:min-h-14 md:grid-cols-[minmax(0,1fr)_12rem] md:items-center md:gap-4",
                "md:rounded-none md:border-0 md:border-b md:border-slate-200 md:px-4 md:py-2.5 md:shadow-none",
                "md:last:border-b-0",
              )}
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-900">{entry.libelle}</p>
                {showRequiredLabel ? (
                  <p className={cn("mt-0.5 text-[10px]", entry.obligatoire ? "text-rose-700" : "text-slate-500")}>
                    {entry.obligatoire ? "Pièce obligatoire" : "Pièce facultative"}
                  </p>
                ) : null}
              </div>
              <div className="mt-3 min-w-0 md:mt-0">
                {canEdit ? (
                  <div className="grid gap-1">
                    <label htmlFor={selectId} className="text-[10px] font-semibold text-slate-600">
                      Statut
                      <span className="lonaci-ui-sr-only"> de {entry.libelle}</span>
                    </label>
                    <select
                      id={selectId}
                      value={status}
                      disabled={saving}
                      onChange={(event) => {
                        const nextStatus = statuses.find(
                          (candidate) => candidate === event.currentTarget.value,
                        );
                        if (nextStatus !== undefined) onStatusChange(entry.itemId, nextStatus);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 shadow-sm focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600/20 disabled:cursor-wait disabled:bg-slate-100"
                    >
                      {statuses.map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {statusLabels[candidate]}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <p className="mb-1 text-[10px] font-semibold text-slate-600">Statut</p>
                    <StatusBadge tone={statusTone(status)}>
                      <StatusIcon tone={statusTone(status)} />
                      {statusLabels[status]}
                      {readOnlySuffix?.(entry)}
                    </StatusBadge>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );

  if (embedded) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Surface className={className} padding="md">
      {content}
    </Surface>
  );
}
