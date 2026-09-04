import type { ModuleCourrierId } from "@/lib/lonaci/module-courrier-types";

export function moduleCourrierPdfUrl(moduleId: ModuleCourrierId, dossierId: string): string {
  return `/api/module-courriers/${encodeURIComponent(moduleId)}/${encodeURIComponent(dossierId)}/pdf?view=1`;
}
