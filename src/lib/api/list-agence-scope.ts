import { forbidden } from "@/lib/api/error-responses";
import { resolveListAgenceFilter } from "@/lib/lonaci/access";
import type { ListAgenceRestriction } from "@/lib/lonaci/list-agence-restriction";
import type { UserDocument } from "@/lib/lonaci/types";
import type { NextResponse } from "next/server";

export type ListAgenceScopeResult =
  | ({ ok: true } & ListAgenceRestriction)
  | { ok: false; response: NextResponse };

/** Résout le filtre agence pour une liste API ; renvoie 403 si hors périmètre. */
export function requireListAgenceScope(
  user: UserDocument,
  requestedAgenceId?: string | null,
): ListAgenceScopeResult {
  const result = resolveListAgenceFilter(user, requestedAgenceId);
  if (!result.ok) {
    return {
      ok: false,
      response: forbidden("Acces refuse pour cette agence.", "AGENCE_FORBIDDEN"),
    };
  }
  return {
    ok: true,
    agenceId: result.agenceId,
    agenceIds: result.agenceIds,
  };
}

/** Champs à passer aux services de liste (Prisma / Mongo). */
export function listAgenceScopeFields(
  scope: Extract<ListAgenceScopeResult, { ok: true }>,
): ListAgenceRestriction & { scopeAgenceId?: string; scopeAgenceIds?: string[] } {
  if (scope.agenceIds && scope.agenceIds.length > 0) {
    if (scope.agenceIds.length === 1) {
      const id = scope.agenceIds[0]!;
      return { agenceId: id, scopeAgenceId: id };
    }
    return { agenceIds: scope.agenceIds, scopeAgenceIds: scope.agenceIds };
  }
  if (scope.agenceId) {
    return { agenceId: scope.agenceId, scopeAgenceId: scope.agenceId };
  }
  return {};
}
