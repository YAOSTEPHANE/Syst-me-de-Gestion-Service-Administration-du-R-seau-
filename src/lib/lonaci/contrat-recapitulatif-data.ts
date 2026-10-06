import "server-only";

import { loadPartySnapshotForDossier, resolveAgenceLabel } from "@/lib/lonaci/contrat-party-snapshot";
import { findAssociatedCautionForDossier } from "@/lib/lonaci/dossier-decharge-provisoire";
import { getDossierProduitCodes } from "@/lib/lonaci/dossier-produits";
import { parseDocumentChecklistPayload } from "@/lib/lonaci/produit-document-checklist";
import { listProduits } from "@/lib/lonaci/referentials";
import { userDisplayName, type DossierDocument } from "@/lib/lonaci/types";
import type { ContratRecapitulatifData, ContratRecapitulatifTitulaire } from "@/lib/pdf/contrat-recapitulatif";
import { prisma } from "@/lib/prisma";

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

async function loadUserNames(userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id) => OBJECT_ID_RE.test(id)))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, prenom: true, nom: true, email: true, matricule: true },
  });
  return new Map(users.map((u) => [u.id, userDisplayName(u)]));
}

export async function buildContratRecapitulatifData(dossier: DossierDocument): Promise<ContratRecapitulatifData> {
  const payload = dossier.payload ?? {};
  const produitCodes = getDossierProduitCodes(payload);
  const parentContratId = typeof payload.parentContratId === "string" ? payload.parentContratId : null;
  const explicitCautionId = typeof payload.cautionId === "string" ? payload.cautionId : null;

  const [party, referentielProduits, contrats, cautions, userNames] = await Promise.all([
    loadPartySnapshotForDossier(dossier),
    listProduits(),
    dossier._id
      ? prisma.contrat.findMany({
          where: {
            AND: [{ dossierId: dossier._id }, { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }],
          },
          orderBy: { createdAt: "asc" },
          select: { reference: true, annexeReference: true, produitCode: true, status: true, dateEffet: true },
        })
      : Promise.resolve([]),
    Promise.all(
      produitCodes.map((produitCode) =>
        findAssociatedCautionForDossier({
          concessionnaireId: dossier.concessionnaireId,
          lonaciClientId: dossier.lonaciClientId,
          produitCode,
          parentContratId,
          explicitCautionId,
        }),
      ),
    ),
    loadUserNames(dossier.history.map((h) => h.actedByUserId)),
  ]);

  const libelleByCode = new Map(referentielProduits.map((p) => [p.code.toUpperCase(), p.libelle]));
  const titulaire: ContratRecapitulatifTitulaire | null = party
    ? {
        kind: party.partyKind,
        nom: party.nomComplet?.trim() || party.raisonSociale,
        code: party.codePdv,
        cniNumero: party.cniNumero,
        telephone: party.telephone,
        adresse: party.adresse,
      }
    : null;

  return {
    dossier,
    titulaire,
    agenceLabel: party?.agenceLabel ?? (await resolveAgenceLabel(dossier.agenceId)),
    produits: produitCodes.map((code, i) => {
      const caution = cautions[i];
      return {
        code,
        libelle: libelleByCode.get(code) ?? code,
        caution: caution ? { referenceLabel: caution.referenceLabel, status: caution.status } : null,
      };
    }),
    checklist: parseDocumentChecklistPayload(payload),
    contrats,
    userNames,
  };
}
