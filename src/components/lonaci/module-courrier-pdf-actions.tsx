"use client";

import { useState } from "react";

import {
  downloadLonaciPdf,
  openLonaciPdfInTab,
  printLonaciPdf,
} from "@/lib/lonaci/download-pdf";
import { friendlyErrorMessage } from "@/lib/lonaci/friendly-messages";
import type { ModuleCourrierId } from "@/lib/lonaci/module-courrier-types";
import { moduleCourrierPdfUrl } from "@/lib/lonaci/module-courrier-url";
import { notify } from "@/lib/toast";

type Tone = "cyan" | "orange" | "violet" | "teal" | "rose" | "slate";

const TONE_BUTTON: Record<Tone, string> = {
  cyan: "border-cyan-600 bg-cyan-600 hover:bg-cyan-700",
  orange: "border-orange-600 bg-orange-600 hover:bg-orange-700",
  violet: "border-violet-600 bg-violet-600 hover:bg-violet-700",
  teal: "border-teal-600 bg-teal-600 hover:bg-teal-700",
  rose: "border-rose-600 bg-rose-600 hover:bg-rose-700",
  slate: "border-slate-600 bg-slate-600 hover:bg-slate-700",
};

const TONE_LINK: Record<Tone, string> = {
  cyan: "text-cyan-700",
  orange: "text-orange-700",
  violet: "text-violet-700",
  teal: "text-teal-700",
  rose: "text-rose-700",
  slate: "text-slate-700",
};

type ModuleCourrierPdfActionsProps = {
  pdfUrl: string;
  filename: string;
  layout?: "inline" | "buttons";
  tone?: Tone;
  className?: string;
};

export function moduleCourrierDownloadFilename(moduleId: ModuleCourrierId, reference: string): string {
  return `courrier-${moduleId}-${reference.replace(/[^\w-]+/g, "_")}.pdf`;
}

export default function ModuleCourrierPdfActions({
  pdfUrl,
  filename,
  layout = "buttons",
  tone = "violet",
  className = "",
}: ModuleCourrierPdfActionsProps) {
  const [busy, setBusy] = useState<"view" | "print" | "download" | null>(null);

  async function run(action: "view" | "print" | "download") {
    setBusy(action);
    try {
      if (action === "view") await openLonaciPdfInTab(pdfUrl);
      else if (action === "print") await printLonaciPdf(pdfUrl);
      else await downloadLonaciPdf(pdfUrl, filename);
    } catch (error) {
      notify.error(
        friendlyErrorMessage(error instanceof Error ? error.message : "Action PDF impossible."),
      );
    } finally {
      setBusy(null);
    }
  }

  if (layout === "inline") {
    return (
      <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold ${className}`}>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("view")}
          className={`underline-offset-2 hover:underline disabled:opacity-50 ${TONE_LINK[tone]}`}
        >
          {busy === "view" ? "Ouverture…" : "Aperçu PDF"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("print")}
          className={`underline-offset-2 hover:underline disabled:opacity-50 ${TONE_LINK[tone]}`}
        >
          {busy === "print" ? "Impression…" : "Imprimer"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("download")}
          className={`underline-offset-2 hover:underline disabled:opacity-50 ${TONE_LINK[tone]}`}
        >
          {busy === "download" ? "Téléchargement…" : "Télécharger"}
        </button>
      </div>
    );
  }

  const btnClass = `inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${TONE_BUTTON[tone]}`;

  return (
    <div className={`mt-2 flex flex-wrap gap-2 ${className}`}>
      <button type="button" disabled={busy !== null} onClick={() => void run("view")} className={btnClass}>
        {busy === "view" ? "Ouverture…" : "Aperçu PDF"}
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void run("print")} className={btnClass}>
        {busy === "print" ? "Impression…" : "Imprimer"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void run("download")}
        className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy === "download" ? "Téléchargement…" : "Télécharger"}
      </button>
    </div>
  );
}

type ModuleCourrierPdfActionsByModuleProps = {
  moduleId: ModuleCourrierId;
  dossierId: string;
  reference: string;
  layout?: "inline" | "buttons";
  tone?: Tone;
  className?: string;
};

export function ModuleCourrierPdfActionsByModule({
  moduleId,
  dossierId,
  reference,
  ...rest
}: ModuleCourrierPdfActionsByModuleProps) {
  return (
    <ModuleCourrierPdfActions
      pdfUrl={moduleCourrierPdfUrl(moduleId, dossierId)}
      filename={moduleCourrierDownloadFilename(moduleId, reference)}
      {...rest}
    />
  );
}
