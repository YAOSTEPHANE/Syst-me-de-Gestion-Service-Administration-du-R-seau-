"use client";

export type DossierCompletIndicatorSize = "sm" | "md" | "banner";

type Props = {
  complet: boolean;
  size?: DossierCompletIndicatorSize;
  /** Pièces obligatoires fournies / total (affiché si total > 0). */
  obligatoiresFournis?: number;
  obligatoiresTotal?: number;
  className?: string;
  /** Mise à jour live sans attendre la sauvegarde serveur. */
  live?: boolean;
};

const LABEL_COMPLET = "DOSSIER COMPLET";
const LABEL_INCOMPLET = "DOSSIER INCOMPLET";

export default function DossierCompletIndicator({
  complet,
  size = "md",
  obligatoiresFournis,
  obligatoiresTotal,
  className = "",
  live = false,
}: Props) {
  const label = complet ? LABEL_COMPLET : LABEL_INCOMPLET;
  const progress =
    obligatoiresTotal != null && obligatoiresTotal > 0 && obligatoiresFournis != null
      ? `${obligatoiresFournis}/${obligatoiresTotal} pièce${obligatoiresTotal > 1 ? "s" : ""} obligatoire${obligatoiresTotal > 1 ? "s" : ""}`
      : null;

  if (size === "banner") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
          complet
            ? "border-emerald-300 bg-emerald-50 text-emerald-950"
            : "border-amber-300 bg-amber-50 text-amber-950"
        } ${className}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${complet ? "bg-emerald-500" : "bg-amber-500"} ${live ? "animate-pulse" : ""}`}
            aria-hidden
          />
          <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
        </div>
        {progress ? <p className="text-[11px] font-medium opacity-90">{progress}</p> : null}
      </div>
    );
  }

  const sizeClass =
    size === "sm"
      ? "px-2 py-0.5 text-[10px]"
      : "px-2.5 py-1 text-[11px]";

  return (
    <span
      role="status"
      aria-live="polite"
      title={progress ?? label}
      className={`inline-flex max-w-full flex-col items-start gap-0.5 rounded-full border font-bold uppercase tracking-wide ${sizeClass} ${
        complet
          ? "border-emerald-300 bg-emerald-100 text-emerald-900"
          : "border-amber-300 bg-amber-100 text-amber-950"
      } ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${complet ? "bg-emerald-600" : "bg-amber-600"}`}
          aria-hidden
        />
        {label}
      </span>
      {progress && size !== "sm" ? (
        <span className="pl-3 text-[9px] font-semibold normal-case tracking-normal opacity-90">{progress}</span>
      ) : null}
    </span>
  );
}

export { LABEL_COMPLET, LABEL_INCOMPLET };
