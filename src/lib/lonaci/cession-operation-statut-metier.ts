import {
  cessionDisplayStatutFields,
  cessionStatutMetierBadgeClass,
  resolveCessionStatutMetier,
  type CessionStatutMetier,
} from "@/lib/lonaci/cession-statut-metier";
import {
  delocalisationDisplayStatutFields,
  delocalisationStatutMetierBadgeClass,
  resolveDelocalisationStatutMetier,
  type DelocalisationStatutMetier,
} from "@/lib/lonaci/delocalisation-statut-metier";

export type CessionOperationKind = "CESSION" | "DELOCALISATION" | "CESSION_DELOCALISATION";

export type OperationStatutMetier = CessionStatutMetier | DelocalisationStatutMetier;

export function cessionOperationDisplayStatutFields(input: {
  kind?: CessionOperationKind | null;
  statut: string;
  checklistComplet?: boolean | null;
  acteGenereAt?: Date | string | null;
}) {
  if (input.kind === "DELOCALISATION") {
    return delocalisationDisplayStatutFields({
      statut: input.statut,
      checklistComplet: input.checklistComplet,
    });
  }
  return cessionDisplayStatutFields({
    kind: input.kind,
    statut: input.statut,
    checklistComplet: input.checklistComplet,
    acteGenereAt: input.acteGenereAt,
  });
}

export function resolveOperationStatutMetier(input: {
  kind?: CessionOperationKind | null;
  statut: string;
  checklistComplet?: boolean | null;
  acteGenereAt?: Date | string | null;
}): OperationStatutMetier | null {
  if (input.statut.trim().toUpperCase() === "REJETEE") return null;
  if (input.kind === "DELOCALISATION") {
    return resolveDelocalisationStatutMetier({
      statut: input.statut,
      checklistComplet: input.checklistComplet,
    });
  }
  return resolveCessionStatutMetier({
    kind: input.kind,
    statut: input.statut,
    checklistComplet: input.checklistComplet,
    acteGenereAt: input.acteGenereAt,
  });
}

export function operationStatutMetierBadgeClass(input: {
  kind?: CessionOperationKind | null;
  statut: string;
  checklistComplet?: boolean | null;
  acteGenereAt?: Date | string | null;
}): string {
  if (input.statut.trim().toUpperCase() === "REJETEE") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  if (input.kind === "DELOCALISATION") {
    return delocalisationStatutMetierBadgeClass(
      resolveDelocalisationStatutMetier({
        statut: input.statut,
        checklistComplet: input.checklistComplet,
      }),
    );
  }
  return cessionStatutMetierBadgeClass(
    resolveCessionStatutMetier({
      kind: input.kind,
      statut: input.statut,
      checklistComplet: input.checklistComplet,
      acteGenereAt: input.acteGenereAt,
    }),
  );
}
