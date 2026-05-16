import "server-only";

import {
  finalizeContratFromDossier,
  findContratByDossierId,
  hasActiveContractForProduct,
} from "@/lib/lonaci/contracts";
import {
  archiveContratSigneForDossier,
  ensureContratFinalizationReady,
  parseContratGenerePayload,
  prepareContratFromDechargeDefinitive,
} from "@/lib/lonaci/contrat-document";
import { findDossierById, transitionDossier } from "@/lib/lonaci/dossiers";
import type { ContratDocument, DossierDocument, UserDocument } from "@/lib/lonaci/types";

export type FinalizeDossierContratErrorCode =
  | "DOSSIER_NOT_FOUND"
  | "INVALID_TYPE"
  | "CONTRAT_NOT_PREPARED"
  | "NOT_READY"
  | "INVALID_PAYLOAD"
  | "ACTIVE_CONTRACT_EXISTS"
  | "CONCESSIONNAIRE_BLOQUE"
  | "FINALIZE_FAILED"
  | "ARCHIVE_FAILED";

export type FinalizeDossierContratResult =
  | {
      ok: true;
      dossier: DossierDocument;
      contrat: ContratDocument;
      alreadyHadContrat: boolean;
    }
  | {
      ok: false;
      code: FinalizeDossierContratErrorCode;
      message: string;
      httpStatus: number;
    };

/**
 * Finalise un dossier CONTRAT_ACTUALISATION : contrat et archive avant passage en FINALISE
 * (évite un dossier FINALISE sans contrat si la création échoue).
 */
export async function finalizeDossierContratActualisation(input: {
  dossierId: string;
  actor: UserDocument;
  comment?: string | null;
}): Promise<FinalizeDossierContratResult> {
  const before = await findDossierById(input.dossierId);
  if (!before || before.deletedAt) {
    return {
      ok: false,
      code: "DOSSIER_NOT_FOUND",
      message: "Dossier introuvable.",
      httpStatus: 404,
    };
  }
  if (before.type !== "CONTRAT_ACTUALISATION") {
    return {
      ok: false,
      code: "INVALID_TYPE",
      message: "Type de dossier non pris en charge pour cette finalisation.",
      httpStatus: 400,
    };
  }

  const existingContrat = await findContratByDossierId(input.dossierId);
  if (existingContrat) {
    const dossier = await findDossierById(input.dossierId);
    if (!dossier) {
      return {
        ok: false,
        code: "DOSSIER_NOT_FOUND",
        message: "Dossier introuvable.",
        httpStatus: 404,
      };
    }
    return {
      ok: true,
      dossier,
      contrat: existingContrat,
      alreadyHadContrat: true,
    };
  }

  if (!parseContratGenerePayload(before.payload ?? {})) {
    try {
      await prepareContratFromDechargeDefinitive(input.dossierId, input.actor);
    } catch {
      return {
        ok: false,
        code: "CONTRAT_NOT_PREPARED",
        message:
          "Contrat non généré : décharge définitive requise (checklist complète et caution payée).",
        httpStatus: 409,
      };
    }
  }

  try {
    await ensureContratFinalizationReady(input.dossierId);
  } catch {
    return {
      ok: false,
      code: "NOT_READY",
      message: "Finalisation impossible : checklist incomplète ou caution non payée.",
      httpStatus: 409,
    };
  }

  const produitCode = String(before.payload.produitCode ?? "").trim().toUpperCase();
  const operationType = String(before.payload.operationType ?? "");
  const dateEffetRaw = String(before.payload.dateEffet ?? "");
  const dateEffet = new Date(dateEffetRaw);
  if (!produitCode || !operationType || Number.isNaN(dateEffet.getTime())) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "Payload dossier contrat invalide.",
      httpStatus: 400,
    };
  }

  if (operationType === "NOUVEAU") {
    const hasActive = await hasActiveContractForProduct(before.concessionnaireId, produitCode);
    if (hasActive) {
      return {
        ok: false,
        code: "ACTIVE_CONTRACT_EXISTS",
        message: "Un contrat actif existe déjà pour ce produit et ce concessionnaire.",
        httpStatus: 409,
      };
    }
  }

  let contrat: ContratDocument;
  try {
    contrat = await finalizeContratFromDossier({
      dossierId: input.dossierId,
      concessionnaireId: before.concessionnaireId,
      produitCode,
      operationType: operationType === "ACTUALISATION" ? "ACTUALISATION" : "NOUVEAU",
      dateEffet,
      actor: input.actor,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CONCESSIONNAIRE_BLOQUE") {
      return {
        ok: false,
        code: "CONCESSIONNAIRE_BLOQUE",
        message: "Concessionnaire bloqué.",
        httpStatus: 409,
      };
    }
    if (code === "ACTIVE_CONTRACT_EXISTS") {
      return {
        ok: false,
        code: "ACTIVE_CONTRACT_EXISTS",
        message: "Un contrat actif existe déjà pour ce produit et ce concessionnaire.",
        httpStatus: 409,
      };
    }
    return {
      ok: false,
      code: "FINALIZE_FAILED",
      message: "Création du contrat impossible.",
      httpStatus: 500,
    };
  }

  try {
    await archiveContratSigneForDossier(input.dossierId, contrat.reference, input.actor);
  } catch {
    return {
      ok: false,
      code: "ARCHIVE_FAILED",
      message: "Contrat créé mais archivage du PDF signé impossible.",
      httpStatus: 500,
    };
  }

  if (before.status !== "FINALISE") {
    await transitionDossier(input.dossierId, "FINALISE", input.actor, input.comment ?? null);
  }

  const dossier = await findDossierById(input.dossierId);
  if (!dossier) {
    return {
      ok: false,
      code: "DOSSIER_NOT_FOUND",
      message: "Dossier introuvable.",
      httpStatus: 404,
    };
  }

  return {
    ok: true,
    dossier,
    contrat,
    alreadyHadContrat: false,
  };
}
