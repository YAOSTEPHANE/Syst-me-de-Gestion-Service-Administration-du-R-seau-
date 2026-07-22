import "server-only";

import { ObjectId } from "mongodb";

import { getLonaciCautionBankReferences } from "@/lib/lonaci/caution-fiche-provisoire-constants";
import { findLonaciClientById } from "@/lib/lonaci/clients";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { produitMontantCautionReferentiel } from "@/lib/lonaci/produit-constants";
import { listProduits } from "@/lib/lonaci/referentials";
import { formatAgenceLibelle, loadAgenceLibelleMap } from "@/lib/lonaci/zones-abidjan";
import type { CautionDocument } from "@/lib/lonaci/types";
import { getDatabase } from "@/lib/mongodb";
import { renderPremiumCautionFicheProvisoirePdf } from "@/lib/pdf/caution-fiche-provisoire";

export {
  CAUTION_FICHE_EN_ATTENTE_MENTION,
  CAUTION_FICHE_PROVISOIRE_TITLE,
} from "@/lib/lonaci/caution-fiche-provisoire-constants";

const CAUTIONS_COLLECTION = "cautions";
const COUNTERS_COLLECTION = "counters";
const CAUTION_CAU_COUNTER_PREFIX = "caution_cau_";

type StoredCaution = Omit<CautionDocument, "_id"> & { _id: ObjectId };

export interface CautionProduitLigne {
  code: string;
  libelle: string;
  montantFCFA: number;
}

export interface CautionFicheProvisoireView {
  cautionId: string;
  numeroDossier: string;
  generatedAt: string;
  identiteLabel: string;
  identiteDetail: string;
  /** Libellé du champ identifiant métier (ex. « Identifiant client » ou « Code PDV »). */
  identifiantLabel: string;
  /** Valeur affichée pour l'identifiant (code client CLI-… ou code PDV). */
  identifiantValue: string | null;
  cniNumero: string | null;
  codePdv: string | null;
  agenceLabel: string;
  produitLignes: CautionProduitLigne[];
  montantTotalFCFA: number;
  dueDate: string;
  bank: ReturnType<typeof getLonaciCautionBankReferences>;
}

function sanitizeAgenceCodeForRef(code: string): string {
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c || "LONACI";
}

/** Référence dossier unique : CAU-2026-EDITEC-0001 */
export async function nextNumeroCautionDossier(agenceCode: string): Promise<string> {
  const db = await getDatabase();
  const year = new Date().getFullYear();
  const code = sanitizeAgenceCodeForRef(agenceCode);
  const counterId = `${CAUTION_CAU_COUNTER_PREFIX}${year}_${code}`;
  await db
    .collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION)
    .updateOne({ _id: counterId }, { $inc: { seq: 1 } }, { upsert: true });
  const c = await db.collection<{ _id: string; seq: number }>(COUNTERS_COLLECTION).findOne({ _id: counterId });
  const seq = c?.seq ?? 1;
  return `CAU-${year}-${code}-${String(seq).padStart(4, "0")}`;
}

export function buildCautionProduitLignes(
  produitCodes: string[],
  produits: Awaited<ReturnType<typeof listProduits>>,
): CautionProduitLigne[] {
  const lignes: CautionProduitLigne[] = [];
  for (const raw of produitCodes) {
    const code = raw.trim().toUpperCase();
    if (!code || code === "AUTRES") continue;
    const p = produits.find((x) => x.code.trim().toUpperCase() === code);
    const montant = p ? produitMontantCautionReferentiel(p) ?? 0 : 0;
    if (!Number.isFinite(montant) || montant <= 0) continue;
    lignes.push({
      code,
      libelle: p?.libelle?.trim() || code,
      montantFCFA: montant,
    });
  }
  return lignes;
}

export function sumCautionProduitLignes(lignes: CautionProduitLigne[]): number {
  return lignes.reduce((acc, l) => acc + l.montantFCFA, 0);
}

export async function findInscriptionCautionForConcessionnaire(
  concessionnaireId: string,
): Promise<{ caution: StoredCaution; cautionId: string } | null> {
  if (!ObjectId.isValid(concessionnaireId)) return null;
  const db = await getDatabase();
  const row = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne(
    { concessionnaireId, deletedAt: null },
    { sort: { createdAt: -1 } },
  );
  if (!row) return null;
  return { caution: row, cautionId: row._id.toHexString() };
}

interface CautionPartyInfo {
  identiteLabel: string;
  identiteDetail: string;
  cniNumero: string | null;
  codePdv: string | null;
  agenceId: string | null;
  produitsAutorises: string[];
}

async function resolveCautionPartyInfo(caution: StoredCaution): Promise<CautionPartyInfo | null> {
  const pdvId = caution.concessionnaireId?.trim();
  if (pdvId) {
    const conc = await findConcessionnaireById(pdvId);
    if (!conc) return null;
    return {
      identiteLabel: "Concessionnaire",
      identiteDetail: conc.raisonSociale?.trim() || conc.nomComplet || "—",
      cniNumero: conc.cniNumero,
      codePdv: conc.codePdv,
      agenceId: conc.agenceId,
      produitsAutorises: conc.produitsAutorises ?? [],
    };
  }

  const clientId = caution.lonaciClientId?.trim();
  if (clientId) {
    const client = await findLonaciClientById(clientId);
    if (!client) return null;
    return {
      identiteLabel: "Client",
      identiteDetail: client.raisonSociale?.trim() || client.nomComplet?.trim() || "—",
      cniNumero: client.cniNumero,
      codePdv: client.code,
      agenceId: client.agenceId,
      produitsAutorises: client.produitsAutorises ?? [],
    };
  }

  return null;
}

export async function buildCautionFicheProvisoireView(
  cautionId: string,
): Promise<CautionFicheProvisoireView | null> {
  if (!ObjectId.isValid(cautionId)) return null;
  const db = await getDatabase();
  const caution = await db.collection<StoredCaution>(CAUTIONS_COLLECTION).findOne({
    _id: new ObjectId(cautionId),
    deletedAt: null,
  });
  if (!caution) return null;

  const party = await resolveCautionPartyInfo(caution);
  if (!party) return null;

  const produits = await listProduits();
  let lignes = buildCautionProduitLignes(party.produitsAutorises, produits);
  if (!lignes.length && caution.produitCode) {
    const code = caution.produitCode.trim().toUpperCase();
    const p = produits.find((x) => x.code.toUpperCase() === code);
    const m = Math.round(caution.montant);
    if (m > 0) {
      lignes = [{ code, libelle: p?.libelle ?? code, montantFCFA: m }];
    }
  }

  const agenceMap = await loadAgenceLibelleMap(db, party.agenceId ? [party.agenceId] : []);
  const agenceLabel = party.agenceId
    ? formatAgenceLibelle(agenceMap.get(party.agenceId), party.agenceId)
    : "Sans agence";

  const numeroDossier =
    caution.numeroFicheProvisoire?.trim() ||
    (caution.paymentReference?.startsWith("PROVISOIRE:")
      ? caution.paymentReference.replace(/^PROVISOIRE:/, "")
      : caution.paymentReference) ||
    "—";

  const isClientParty = party.identiteLabel === "Client";

  return {
    cautionId,
    numeroDossier,
    generatedAt: caution.createdAt.toISOString(),
    identiteLabel: party.identiteLabel,
    identiteDetail: party.identiteDetail,
    identifiantLabel: isClientParty ? "Identifiant client" : "Code PDV",
    identifiantValue: party.codePdv,
    cniNumero: party.cniNumero,
    codePdv: party.codePdv,
    agenceLabel,
    produitLignes: lignes,
    montantTotalFCFA: caution.montant,
    dueDate: caution.dueDate.toISOString(),
    bank: getLonaciCautionBankReferences(),
  };
}

export async function renderCautionFicheProvisoirePdf(view: CautionFicheProvisoireView): Promise<Buffer> {
  return renderPremiumCautionFicheProvisoirePdf(view);
}

export async function buildCautionFicheProvisoireViewForConcessionnaire(
  concessionnaireId: string,
): Promise<CautionFicheProvisoireView | null> {
  const found = await findInscriptionCautionForConcessionnaire(concessionnaireId);
  if (!found) return null;
  return buildCautionFicheProvisoireView(found.cautionId);
}
