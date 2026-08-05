import { describe, expect, it } from "vitest";

import { normalizeSoumissionStatut } from "@/lib/lonaci/soumission-constants";
import {
  mapSoumissionImportRowFromRecord,
  parseNombreTpe,
  parseSoumissionImportDate,
} from "@/lib/lonaci/soumissions-import-map";

describe("soumission-constants", () => {
  it("normalise les libellés FR vers les statuts pipeline", () => {
    expect(normalizeSoumissionStatut("À appeler")).toBe("A_APPELER");
    expect(normalizeSoumissionStatut("en cours")).toBe("EN_COURS");
    expect(normalizeSoumissionStatut("En attente de paiement")).toBe("EN_ATTENTE_PAIEMENT");
    expect(normalizeSoumissionStatut("converti")).toBe("CONVERTI");
    expect(normalizeSoumissionStatut("sans suite")).toBe("SANS_SUITE");
    expect(normalizeSoumissionStatut("inconnu")).toBeNull();
  });
});

describe("soumissions-import-map", () => {
  it("mappe les en-têtes FR", () => {
    const mapped = mapSoumissionImportRowFromRecord({
      "Nom complet": "KOUASSI JEAN",
      Contact: "+2250700000000",
      "Type de distributeur": "NOUVEAU",
      "Nombre de TPE": "2",
      Agence: "ABOBO",
      Produit: "LOTO",
      Statut: "A_APPELER",
      Date: "2026-07-01",
      Observation: "Rappeler demain",
      Appelé: "Oui",
    });
    expect(mapped.nomComplet).toBe("KOUASSI JEAN");
    expect(mapped.contact).toBe("+2250700000000");
    expect(mapped.typeDistributeur).toBe("NOUVEAU");
    expect(mapped.nombreTpe).toBe("2");
    expect(mapped.agence).toBe("ABOBO");
    expect(mapped.produitCode).toBe("LOTO");
    expect(mapped.statut).toBe("A_APPELER");
    expect(mapped.observations).toBe("Rappeler demain");
    expect(mapped.appele).toBe(true);
  });

  it("mappe Noms et Prénoms et colonnes atypiques", () => {
    const mapped = mapSoumissionImportRowFromRecord({
      "Noms et Prénoms": "Bamba Fatou",
      Téléphone: "0700110004",
      Agence: "ABOBO",
    });
    expect(mapped.nomComplet).toBe("Bamba Fatou");
    expect(mapped.contact).toBe("0700110004");
    expect(mapped.agence).toBe("ABOBO");
  });

  it("récupère le nom en première colonne si en-têtes partiels", () => {
    const mapped = mapSoumissionImportRowFromRecord({
      Prospect: "YAO Serge",
      Contact: "+2250700110005",
      Agence: "YAM",
    });
    expect(mapped.nomComplet).toBe("YAO Serge");
    expect(mapped.contact).toBe("+2250700110005");
  });

  it("force l’ordre positionnel si le nom n’est pas mappé", () => {
    const mapped = mapSoumissionImportRowFromRecord({
      ColA: "OUATTARA Mariam",
      ColB: "0700110006",
      ColC: "NOUVEAU",
      ColD: "0",
      ColE: "ABJ",
    });
    expect(mapped.nomComplet).toBe("OUATTARA Mariam");
    expect(mapped.contact).toBe("0700110006");
  });

  it("infère le contact depuis un en-tête GSM ou une valeur téléphone", () => {
    const byHeader = mapSoumissionImportRowFromRecord({
      "Nom complet": "KOFFI Michel",
      GSM: "07 00 11 00 03",
      Agence: "ABJ",
    });
    expect(byHeader.contact).toBe("07 00 11 00 03");

    const byValue = mapSoumissionImportRowFromRecord({
      "Nom complet": "TRAORE Aicha",
      Divers: 700110002,
      Agence: "ABOBO",
    });
    expect(byValue.contact).toBe("700110002");
  });

  it("complète le contact en positionnel si seule la colonne nom est reconnue", () => {
    const mapped = mapSoumissionImportRowFromRecord({
      Prospect: "DIALLO Ibrahim",
      ColTel: "0700110007",
      ColType: "NOUVEAU",
      ColTpe: "1",
      ColAgence: "YAM",
    });
    expect(mapped.nomComplet).toBe("DIALLO Ibrahim");
    expect(mapped.contact).toBe("0700110007");
  });

  it("parse date et nombre de TPE", () => {
    expect(parseNombreTpe("3")).toBe(3);
    expect(parseNombreTpe("-1")).toBeNull();
    const d = parseSoumissionImportDate("01/07/2026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
  });
});
