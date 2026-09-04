import type { FairePartKind } from "@/lib/lonaci/module-faire-part-types";
import { FAIRE_PART_KIND_META } from "@/lib/lonaci/module-faire-part-types";

export function fairePartPdfUrl(successionCaseId: string, kind: FairePartKind = "demande"): string {
  return `/api/succession-cases/${encodeURIComponent(successionCaseId)}/faire-part/${encodeURIComponent(kind)}/pdf?view=1`;
}

export function fairePartDownloadFilename(reference: string, kind: FairePartKind = "demande"): string {
  const prefix = FAIRE_PART_KIND_META[kind].filenamePrefix;
  return `${prefix}-${reference.replace(/[^\w-]+/g, "_")}.pdf`;
}
