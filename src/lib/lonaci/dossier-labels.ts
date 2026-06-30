import {
  CONTRAT_OPERATION_TYPE_LABELS,
  CONTRAT_OPERATION_TYPES,
  DOSSIER_TYPE_LABELS,
  type ContratOperationType,
  type DossierType,
} from "@/lib/lonaci/constants";

export function parseContratOperationType(
  payload: Record<string, unknown> | null | undefined,
): ContratOperationType | null {
  const raw = payload?.operationType;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toUpperCase();
  if ((CONTRAT_OPERATION_TYPES as readonly string[]).includes(normalized)) {
    return normalized as ContratOperationType;
  }
  return null;
}

export function dossierTypeLabel(type: string): string {
  if ((Object.keys(DOSSIER_TYPE_LABELS) as DossierType[]).includes(type as DossierType)) {
    return DOSSIER_TYPE_LABELS[type as DossierType];
  }
  return type.replace(/_/g, " ").toLowerCase();
}

export function contratOperationTypeLabel(operationType: ContratOperationType | null | undefined): string | null {
  if (!operationType) return null;
  return CONTRAT_OPERATION_TYPE_LABELS[operationType];
}

/** Libellé court pour listes : type d'opération métier (nouveau / actualisation). */
export function formatDossierOperationLabel(
  type: string,
  payload: Record<string, unknown> | null | undefined,
): string {
  const operation = parseContratOperationType(payload);
  const operationLabel = contratOperationTypeLabel(operation);
  if (operationLabel) return operationLabel;
  return dossierTypeLabel(type);
}

/** Libellé détaillé : catégorie dossier + opération. */
export function formatDossierTypeDetail(
  type: string,
  payload: Record<string, unknown> | null | undefined,
): string {
  const category = dossierTypeLabel(type);
  const operationLabel = contratOperationTypeLabel(parseContratOperationType(payload));
  if (operationLabel) return `${category} — ${operationLabel}`;
  return category;
}
