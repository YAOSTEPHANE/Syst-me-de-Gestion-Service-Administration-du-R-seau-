import "server-only";

import { ObjectId } from "mongodb";

import {
  buildCautionFicheDefinitiveView,
  type CautionFicheDefinitiveView,
} from "@/lib/lonaci/caution-fiche-definitive";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import type { CautionDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import { cautionEligibleCourrierComptabilite } from "@/lib/lonaci/courrier-comptabilite-constants";
import { assertDossierPartyReadable, contratPartyFromDossier } from "@/lib/lonaci/dossier-contrat-party";
import { findDossierById } from "@/lib/lonaci/dossiers";
import { resolveDossierCautionsStatus } from "@/lib/lonaci/dossier-produits";
import type { UserDocument } from "@/lib/lonaci/types";
import { renderPremiumCourrierComptabiliteClientPdf } from "@/lib/pdf/courrier-comptabilite-client";

export {
  COURRIER_COMPTABILITE_DESCRIPTION,
  COURRIER_COMPTABILITE_OBJET,
  COURRIER_COMPTABILITE_TITLE,
  cautionEligibleCourrierComptabilite,
} from "@/lib/lonaci/courrier-comptabilite-constants";

export interface CourrierComptabiliteClientView {
  referenceCourrier: string;
  generatedAt: Date;
  datePaiement: Date;
  destinataireComptabilite: string;
  nomComplet: string;
  raisonSociale: string;
  clientCode: string | null;
  codePdv: string | null;
  agenceLabel: string;
  produitCode: string;
  produitLibelle: string | null;
  montantFCFA: number;
  modeLibelle: string;
  paymentReference: string;
  numeroFicheDefinitive: string;
  numeroFicheProvisoire: string | null;
  dossierReference: string | null;
  etabliParAgence: string;
}

function referenceCourrierFromFiche(numeroFicheDefinitive: string): string {
  return `CCOM-${numeroFicheDefinitive.trim()}`;
}

function viewFromCautionFiche(
  fiche: CautionFicheDefinitiveView,
  options?: { dossierReference?: string | null; codePdv?: string | null; raisonSociale?: string },
): CourrierComptabiliteClientView {
  const raisonSociale = options?.raisonSociale?.trim() || fiche.identiteDetail.trim() || "—";
  const codePdv = options?.codePdv?.trim() || fiche.clientCode?.trim() || null;
  return {
    referenceCourrier: referenceCourrierFromFiche(fiche.numeroFicheDefinitive),
    generatedAt: new Date(),
    datePaiement: new Date(fiche.datePaiement),
    destinataireComptabilite: raisonSociale,
    nomComplet: fiche.identiteDetail,
    raisonSociale,
    clientCode: fiche.clientCode,
    codePdv,
    agenceLabel: fiche.agenceLabel,
    produitCode: fiche.produitCode,
    produitLibelle: fiche.produitLibelle,
    montantFCFA: fiche.montantFCFA,
    modeLibelle: fiche.modeLibelle,
    paymentReference: fiche.paymentReference,
    numeroFicheDefinitive: fiche.numeroFicheDefinitive,
    numeroFicheProvisoire: fiche.numeroFicheProvisoire,
    dossierReference: options?.dossierReference?.trim() || null,
    etabliParAgence: fiche.agenceLabel,
  };
}

async function resolveCourrierPartyCodes(fiche: CautionFicheDefinitiveView): Promise<{
  codePdv: string | null;
  raisonSociale: string;
}> {
  if (fiche.lonaciClientId?.trim()) {
    const client = await findLonaciClientById(fiche.lonaciClientId.trim());
    return {
      codePdv: client?.code?.trim() || fiche.clientCode,
      raisonSociale: client?.raisonSociale?.trim() || fiche.identiteDetail,
    };
  }

  if (!ObjectId.isValid(fiche.cautionId)) {
    return { codePdv: null, raisonSociale: fiche.identiteDetail };
  }

  const db = await getDatabase();
  const caution = await db.collection<Omit<CautionDocument, "_id"> & { _id: ObjectId }>("cautions").findOne({
    _id: new ObjectId(fiche.cautionId),
    deletedAt: null,
  });
  const pdvId = caution?.concessionnaireId?.trim();
  if (pdvId) {
    const conc = await findConcessionnaireById(pdvId);
    return {
      codePdv: conc?.codePdv?.trim() || null,
      raisonSociale: conc?.raisonSociale?.trim() || conc?.nomComplet?.trim() || fiche.identiteDetail,
    };
  }

  return { codePdv: null, raisonSociale: fiche.identiteDetail };
}

export async function buildCourrierComptabiliteFromCautionId(
  cautionId: string,
  dossierReference?: string | null,
): Promise<CourrierComptabiliteClientView | null> {
  const fiche = await buildCautionFicheDefinitiveView(cautionId);
  if (!fiche || !cautionEligibleCourrierComptabilite(fiche.numeroFicheDefinitive)) {
    return null;
  }

  const party = await resolveCourrierPartyCodes(fiche);
  return viewFromCautionFiche(fiche, {
    dossierReference,
    codePdv: party.codePdv,
    raisonSociale: party.raisonSociale,
  });
}

export async function buildCourrierComptabiliteFromDossierId(
  dossierId: string,
  _actor: UserDocument,
): Promise<CourrierComptabiliteClientView | null> {
  void _actor;
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt || dossier.type !== "CONTRAT_ACTUALISATION") {
    return null;
  }

  const party = contratPartyFromDossier(dossier);
  if (!party) return null;

  const cautionsStatus = await resolveDossierCautionsStatus(dossier);
  if (!cautionsStatus.allPaid) return null;

  const primaryLink = cautionsStatus.links.find((l) => l.cautionId) ?? cautionsStatus.links[0];
  const cautionId = primaryLink?.cautionId?.trim();
  if (!cautionId) return null;

  return buildCourrierComptabiliteFromCautionId(cautionId, dossier.reference);
}

export async function assertCourrierComptabiliteDossierReadable(
  dossierId: string,
  actor: UserDocument,
): Promise<{ dossierReference: string } | null> {
  const dossier = await findDossierById(dossierId);
  if (!dossier || dossier.deletedAt) return null;
  const party = contratPartyFromDossier(dossier);
  if (!party) return null;
  await assertDossierPartyReadable(party, actor);
  return { dossierReference: dossier.reference };
}

export async function renderCourrierComptabiliteClientPdf(view: CourrierComptabiliteClientView): Promise<Buffer> {
  return renderPremiumCourrierComptabiliteClientPdf(view);
}
