/** Périmètre agence résolu pour les listes (une agence, plusieurs, ou vue nationale). */
export type ListAgenceRestriction = {
  agenceId?: string;
  agenceIds?: string[];
};

export function restrictionToMongoAgenceFilter(
  restriction: ListAgenceRestriction,
): string | { $in: string[] } | undefined {
  if (restriction.agenceIds && restriction.agenceIds.length > 0) {
    return restriction.agenceIds.length === 1
      ? restriction.agenceIds[0]
      : { $in: restriction.agenceIds };
  }
  if (restriction.agenceId) {
    return restriction.agenceId;
  }
  return undefined;
}

export function restrictionToPrismaAgenceWhere(
  restriction: ListAgenceRestriction,
): { agenceId: string } | { agenceId: { in: string[] } } | Record<string, never> {
  if (restriction.agenceIds && restriction.agenceIds.length > 0) {
    return restriction.agenceIds.length === 1
      ? { agenceId: restriction.agenceIds[0]! }
      : { agenceId: { in: restriction.agenceIds } };
  }
  if (restriction.agenceId) {
    return { agenceId: restriction.agenceId };
  }
  return {};
}
