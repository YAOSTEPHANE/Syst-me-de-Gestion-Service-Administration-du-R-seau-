import { describe, expect, it } from "vitest";

import {
  canAttachRib,
  canCreateRibDemande,
  canIntegrateBancarisation,
  canValidateRib,
} from "@/lib/lonaci/rib-bancarisation";
import type { ConcessionnaireDocument } from "@/lib/lonaci/types";

function baseDoc(overrides: Partial<ConcessionnaireDocument> = {}): ConcessionnaireDocument {
  return {
    _id: "abc",
    codePdv: "PDV001",
    inscriptionStatut: "VALIDE",
    nom: "Dupont",
    prenom: "Jean",
    codeTerminal: null,
    codeConcessionnaire: null,
    nomComplet: "Jean Dupont",
    raisonSociale: "Jean Dupont",
    cniNumero: null,
    photoUrl: null,
    email: "j@example.com",
    telephonePrincipal: "+22501020304",
    telephoneSecondaire: null,
    telephone: "+22501020304",
    adresse: null,
    ville: null,
    codePostal: null,
    agenceId: "ag1",
    produitsAutorises: ["LOTO"],
    statut: "ACTIF",
    statutBancarisation: "NON_BANCARISE",
    etatRib: null,
    ribDemandeAt: null,
    ribFourniAt: null,
    ribValideAt: null,
    bancariseAt: null,
    ribPieceId: null,
    compteBancaire: null,
    banqueEtablissement: null,
    gps: null,
    documentChecklist: null,
    inscriptionSoumisAt: null,
    inscriptionValideN1At: null,
    inscriptionRejetMotif: null,
    piecesJointes: [],
    observations: null,
    notesInternes: null,
    createdByUserId: "u1",
    updatedByUserId: "u1",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe("parcours RIB et bancarisation", () => {
  it("autorise une demande RIB uniquement en NON BANCARISÉ", () => {
    expect(canCreateRibDemande(baseDoc())).toBe(true);
    expect(canCreateRibDemande(baseDoc({ statutBancarisation: "EN_ATTENTE_RIB" }))).toBe(false);
    expect(canCreateRibDemande(baseDoc({ statutBancarisation: "BANCARISE" }))).toBe(false);
  });

  it("enchaîne les transitions de bancarisation", () => {
    expect(canAttachRib(baseDoc({ statutBancarisation: "EN_ATTENTE_RIB" }))).toBe(true);
    expect(canValidateRib(baseDoc({ statutBancarisation: "RIB_FOURNI" }))).toBe(true);
    expect(canIntegrateBancarisation(baseDoc({ statutBancarisation: "RIB_VALIDE" }))).toBe(true);
    expect(canIntegrateBancarisation(baseDoc({ statutBancarisation: "BANCARISE" }))).toBe(false);
  });

  it("lit le legacy EN_COURS + etatRib", () => {
    const legacy = { statutBancarisation: "EN_COURS" } as unknown as Partial<ConcessionnaireDocument>;
    expect(canValidateRib(baseDoc({ ...legacy, etatRib: "RIB_FOURNI" }))).toBe(true);
    expect(canIntegrateBancarisation(baseDoc({ ...legacy, etatRib: "RIB_VALIDE" }))).toBe(true);
  });
});
