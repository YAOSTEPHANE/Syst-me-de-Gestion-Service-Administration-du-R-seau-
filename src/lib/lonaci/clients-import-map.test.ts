import { describe, expect, it } from "vitest";

import {
  isBlankMappedClientRow,
  mapClientImportRowFromRecord,
  pickImportField,
} from "@/lib/lonaci/clients-import-map";

describe("mapClientImportRowFromRecord", () => {
  it("mappe les en-têtes FR du tableau vers les bons champs", () => {
    const mapped = mapClientImportRowFromRecord({
      Code: "000001",
      "Code machine": "TERM-42",
      Catégorie: "PARTICULIER",
      "Nom complet": "Awa Koné",
      "Raison sociale": "",
      CNI: "CNI998877",
      Contact: "Awa",
      Email: "awa@example.test",
      Téléphone: "+2250700000000",
      Agence: "ABOBO",
      Produits: "LOTO;PMU",
      Notes: "ok",
    });
    expect(mapped.code).toBe("000001");
    expect(mapped.codeMachine).toBe("TERM-42");
    expect(mapped.categorie).toBe("PARTICULIER");
    expect(mapped.nomComplet).toBe("Awa Koné");
    expect(mapped.cniNumero).toBe("CNI998877");
    expect(mapped.telephone).toBe("+2250700000000");
    expect(mapped.agence).toBe("ABOBO");
    expect(mapped.produitsAutorises).toBe("LOTO;PMU");
  });

  it("accepte les clés techniques camelCase", () => {
    const mapped = mapClientImportRowFromRecord({
      code: "12",
      codeMachine: "M-1",
      nomComplet: "Jean",
      cniNumero: "CNI112233",
      agence: "ABOBO",
    });
    expect(mapped.code).toBe("12");
    expect(mapped.codeMachine).toBe("M-1");
    expect(mapped.nomComplet).toBe("Jean");
  });

  it("fallback positionnel si en-têtes génériques", () => {
    const mapped = mapClientImportRowFromRecord({
      "0": "000099",
      "1": "TERM-9",
      "2": "PARTICULIER",
      "3": "Nom Test",
      "4": "",
      "5": "CNI445566",
      "6": "",
      "7": "",
      "8": "",
      "9": "NOUVEAU",
      "10": "2",
      "11": "DIST-1",
      "12": "TPM-1",
      "13": "",
      "14": "",
      "15": "",
      "16": "ABOBO",
      "17": "LOTO",
      "18": "",
    });
    expect(mapped.code).toBe("000099");
    expect(mapped.codeMachine).toBe("TERM-9");
    expect(mapped.nomComplet).toBe("Nom Test");
    expect(mapped.cniNumero).toBe("CNI445566");
    expect(mapped.typeConcession).toBe("NOUVEAU");
    expect(mapped.nombreTpm).toBe("2");
    expect(mapped.numeroDistributeur).toBe("DIST-1");
    expect(mapped.numeroTpm).toBe("TPM-1");
    expect(mapped.agence).toBe("ABOBO");
    expect(mapped.produitsAutorises).toBe("LOTO");
  });

  it("détecte une ligne vide", () => {
    expect(isBlankMappedClientRow(mapClientImportRowFromRecord({}))).toBe(true);
  });
});

describe("pickImportField", () => {
  it("ignore accents et espaces", () => {
    expect(
      pickImportField({ "Code machine": "X1" }, ["codeMachine", "code machine"]),
    ).toBe("X1");
    expect(pickImportField({ Catégorie: "ENTREPRISE" }, ["categorie"])).toBe("ENTREPRISE");
  });
});
