import "server-only";

import {
  contratPartyFromDossier,
  type ContratPartyRef,
} from "@/lib/lonaci/dossier-contrat-party";
import {
  finalizeContratFromDossier,
  findContratByDossierId,
  findContratsByDossierId,
  hasActiveContractForParty,
} from "@/lib/lonaci/contracts";
import {
  archiveContratSigneForDossier,
  ensureContratFinalizationReady,
  parseContratGenerePayload,
  parseContratsGeneresPayload,
  prepareContratFromDechargeDefinitive,
} from "@/lib/lonaci/contrat-document";
import { findDossierById, transitionDossier } from "@/lib/lonaci/dossiers";
import { getDossierProduitCodes } from "@/lib/lonaci/dossier-produits";
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
      contrats: ContratDocument[];
      alreadyHadContrat: boolean;
    }
  | {
      ok: false;
      code: FinalizeDossierContratErrorCode;
      message: string;
      httpStatus: number;
    };

/**
 * Finalise un dossier CONTRAT_ACTUALISATION : un contrat par produit du dossier.
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

  const produitCodes = getDossierProduitCodes(before.payload ?? {});
  const existingContrats = await findContratsByDossierId(input.dossierId);
  const allProductsHaveContrat =
    produitCodes.length > 0 &&
    produitCodes.every((pcode) =>
      existingContrats.some((c) => c.produitCode.trim().toUpperCase() === pcode),
    );

  if (allProductsHaveContrat) {
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
      contrat: existingContrats[0],
      contrats: existingContrats,
      alreadyHadContrat: true,
    };
  }

  const hasPrepared =
    parseContratsGeneresPayload(before.payload ?? {}).length > 0 ||
    Boolean(parseContratGenerePayload(before.payload ?? {}));
  if (!hasPrepared) {
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

  const operationType = String(before.payload.operationType ?? "");
  const dateEffetRaw = String(before.payload.dateEffet ?? "");
  const dateEffet = new Date(dateEffetRaw);
  if (!produitCodes.length || !operationType || Number.isNaN(dateEffet.getTime())) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "Payload dossier contrat invalide.",
      httpStatus: 400,
    };
  }

  const party = contratPartyFromDossier(before);
  if (!party) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "Dossier sans client ni concessionnaire rattaché.",
      httpStatus: 400,
    };
  }

  if (operationType === "NOUVEAU") {
    for (const pcode of produitCodes) {
      const hasActive = await hasActiveContractForParty(party, pcode);
      if (hasActive) {
        return {
          ok: false,
          code: "ACTIVE_CONTRACT_EXISTS",
          message: "Un contrat actif existe déjà pour ce produit et ce client.",
          httpStatus: 409,
        };
      }
    }
  }

  const contrats: ContratDocument[] = [...existingContrats];
  try {
    for (const produitCode of produitCodes) {
      if (contrats.some((c) => c.produitCode.trim().toUpperCase() === produitCode)) {
        continue;
      }
      const contrat = await finalizeContratFromDossier({
        dossierId: input.dossierId,
        concessionnaireId: party.kind === "concessionnaire" ? party.concessionnaireId : null,
        lonaciClientId: party.kind === "client" ? party.lonaciClientId : null,
        produitCode,
        operationType: operationType === "ACTUALISATION" ? "ACTUALISATION" : "NOUVEAU",
        dateEffet,
        actor: input.actor,
      });
      contrats.push(contrat);
      try {
        await archiveContratSigneForDossier(
          input.dossierId,
          contrat.reference,
          input.actor,
          produitCode,
        );
      } catch {
        return {
          ok: false,
          code: "ARCHIVE_FAILED",
          message: "Contrat créé mais archivage du PDF signé impossible.",
          httpStatus: 500,
        };
      }
    }
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
    contrat: contrats[0],
    contrats,
    alreadyHadContrat: false,
  };
}
