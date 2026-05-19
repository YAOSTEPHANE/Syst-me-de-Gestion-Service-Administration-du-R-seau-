import "server-only";

import { getAppSettings, ensureAppSettingsIndexes } from "@/lib/lonaci/app-settings";
import {
  cautionStatutMetierDescription,
  cautionStatutMetierLabel,
  resolveCautionStatutMetier,
  type CautionStatutMetier,
} from "@/lib/lonaci/caution-statut-metier";
import { getResolvedAlertThresholds } from "@/lib/lonaci/alert-thresholds";
import {
  buildCautionProduitLignes,
  findInscriptionCautionForConcessionnaire,
  nextNumeroCautionDossier,
  sumCautionProduitLignes,
} from "@/lib/lonaci/caution-fiche-provisoire";
import type { CautionDocument, ConcessionnaireDocument } from "@/lib/lonaci/types";
import { appendAuditLog } from "@/lib/lonaci/audit";
import { listProduits } from "@/lib/lonaci/referentials";
import { ensureSprint4Indexes } from "@/lib/lonaci/sprint4";
import { getDatabase } from "@/lib/mongodb";

const CAUTIONS_COLLECTION = "cautions";

type InsertCaution = Omit<CautionDocument, "_id">;

export interface InscriptionCautionSummary {
  cautionId: string | null;
  numeroFicheProvisoire: string | null;
  numeroFicheDefinitive: string | null;
  status: string | null;
  statutMetier: CautionStatutMetier | null;
  statutMetierLabel: string | null;
  statutMetierDescription: string | null;
  montant: number | null;
  ficheProvisoire: boolean;
  paidAt: string | null;
}

export async function getInscriptionCautionSummary(
  concessionnaireId: string,
): Promise<InscriptionCautionSummary> {
  const found = await findInscriptionCautionForConcessionnaire(concessionnaireId);
  if (!found) {
    return {
      cautionId: null,
      numeroFicheProvisoire: null,
      numeroFicheDefinitive: null,
      status: null,
      statutMetier: null,
      statutMetierLabel: null,
      statutMetierDescription: null,
      montant: null,
      ficheProvisoire: false,
      paidAt: null,
    };
  }
  const caution = found.caution;
  const thr = await getResolvedAlertThresholds();
  const today = new Date();
  const overdueThreshold = new Date(today);
  overdueThreshold.setDate(today.getDate() - thr.cautionOverdueDays);
  const statutMetier = resolveCautionStatutMetier({
    status: caution.status,
    dueDate: caution.dueDate,
    overdueThresholdDate: overdueThreshold,
  });
  return {
    cautionId: found.cautionId,
    numeroFicheProvisoire: caution.numeroFicheProvisoire ?? null,
    numeroFicheDefinitive: caution.numeroFicheDefinitive ?? null,
    status: caution.status,
    statutMetier,
    statutMetierLabel: cautionStatutMetierLabel(statutMetier),
    statutMetierDescription: cautionStatutMetierDescription(statutMetier),
    montant: caution.montant,
    ficheProvisoire: Boolean(caution.ficheProvisoire),
    paidAt: caution.paidAt ? caution.paidAt.toISOString() : null,
  };
}

/**
 * À la création du dossier concessionnaire (parcours inscription) : fiche provisoire + caution EN_ATTENTE.
 */
export async function ensureInscriptionCautionProvisoireOnCreate(input: {
  concessionnaire: ConcessionnaireDocument;
  agenceCode: string;
  actorUserId: string;
}): Promise<string | null> {
  const pdvId = input.concessionnaire._id?.trim();
  if (!pdvId) return null;

  const existing = await findInscriptionCautionForConcessionnaire(pdvId);
  if (existing) return existing.cautionId;

  await ensureSprint4Indexes();
  await ensureAppSettingsIndexes();

  const produits = await listProduits();
  const lignes = buildCautionProduitLignes(input.concessionnaire.produitsAutorises ?? [], produits);
  const montant = sumCautionProduitLignes(lignes);
  if (montant <= 0) {
    return null;
  }

  const primaryCode = lignes[0]?.code ?? null;
  const numeroDossier = await nextNumeroCautionDossier(input.agenceCode);
  const settings = await getAppSettings();
  const due = new Date();
  due.setDate(due.getDate() + settings.alertCautionMaxDays);

  const now = new Date();
  const doc: InsertCaution = {
    concessionnaireId: pdvId,
    produitCode: primaryCode,
    montant,
    modeReglement: "PAIEMENT_DIFFERE",
    status: "EN_ATTENTE",
    dueDate: due,
    paymentReference: `PROVISOIRE:${numeroDossier}`,
    observations: null,
    ficheProvisoire: true,
    numeroFicheProvisoire: numeroDossier,
    paidAt: null,
    immutableAfterFinal: false,
    createdByUserId: input.actorUserId,
    updatedByUserId: input.actorUserId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const db = await getDatabase();
  const result = await db.collection<InsertCaution>(CAUTIONS_COLLECTION).insertOne(doc);

  const cautionId = result.insertedId.toHexString();
  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: pdvId,
    action: "CAUTION_FICHE_PROVISOIRE_EMISE",
    userId: input.actorUserId,
    details: {
      cautionId,
      numeroDossier,
      montant,
      produitCodes: lignes.map((l) => l.code),
      generatedAt: now.toISOString(),
    },
  });

  return cautionId;
}

export async function appendCautionFicheProvisoirePdfAudit(input: {
  concessionnaireId: string;
  cautionId: string;
  userId: string;
  numeroDossier: string;
}): Promise<void> {
  await appendAuditLog({
    entityType: "CONCESSIONNAIRE",
    entityId: input.concessionnaireId,
    action: "CAUTION_FICHE_PROVISOIRE_PDF",
    userId: input.userId,
    details: {
      cautionId: input.cautionId,
      numeroDossier: input.numeroDossier,
      downloadedAt: new Date().toISOString(),
    },
  });
}
