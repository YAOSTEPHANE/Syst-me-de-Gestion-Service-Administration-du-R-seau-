import { describe, expect, it } from "vitest";

import {
  normalizeClientImportRow,
  resolveAgenceFromImportToken,
} from "@/lib/lonaci/clients-import";
import type { AgenceDocument } from "@/lib/lonaci/types";

const agences: AgenceDocument[] = [
  {
    _id: "507f1f77bcf86cd799439011",
    code: "ABOBO",
    libelle: "Agence Abobo",
    zoneGeographique: "ABIDJAN",
    actif: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  },
];

describe("normalizeClientImportRow", () => {
  it("accepte un particulier minimal", () => {
    const result = normalizeClientImportRow({
      code: "000042",
      nomComplet: "Awa Koné",
      cniNumero: "CNI998877",
      agence: "ABOBO",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.categorie).toBe("PARTICULIER");
    expect(result.value.nomComplet).toBe("Awa Koné");
    expect(result.value.raisonSociale).toBe("Awa Koné");
    expect(result.value.produitsAutorises).toEqual([]);
  });

  it("exige la raison sociale pour une entreprise", () => {
    const result = normalizeClientImportRow({
      code: "000043",
      categorie: "ENTREPRISE",
      nomComplet: "Contact",
      cniNumero: "RCCM1234",
      agence: "ABOBO",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/raisonSociale/i);
  });

  it("parse les produits séparés par point-virgule", () => {
    const result = normalizeClientImportRow({
      code: "000044",
      nomComplet: "Jean",
      cniNumero: "CNI112233",
      agence: "Abobo",
      produitsAutorises: "loto; pmu | GRATTAGE",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.produitsAutorises).toEqual(["LOTO", "PMU", "GRATTAGE"]);
  });

  it("accepte codeMachine depuis alias codeTerminal", () => {
    const result = normalizeClientImportRow({
      code: "000046",
      nomComplet: "Awa",
      cniNumero: "CNI556677",
      agence: "ABOBO",
      codeTerminal: "TERM-42",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.codeMachine).toBe("TERM-42");
  });

  it("mappe les en-têtes FR Excel vers les champs", () => {
    const result = normalizeClientImportRow({
      Code: "000047",
      "Code machine": "TERM-7",
      Catégorie: "PARTICULIER",
      "Nom complet": "Fatou Diallo",
      CNI: "CNI778899",
      Agence: "ABOBO",
      Produits: "PMU",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.code).toBe("000047");
    expect(result.value.codeMachine).toBe("TERM-7");
    expect(result.value.nomComplet).toBe("Fatou Diallo");
    expect(result.value.cniNumero).toBe("CNI778899");
    expect(result.value.produitsAutorises).toEqual(["PMU"]);
  });

  it("déduit un code si la colonne Code est absente", () => {
    const result = normalizeClientImportRow(
      {
        "Nom complet": "Fatou Diallo",
        "N° Distributeur": "DIST-88",
        Agence: "ABOBO",
        CNI: "CNI778899",
      },
      3,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.code).toBe("DIST-88");
    expect(result.value.nomComplet).toBe("Fatou Diallo");
  });

  it("génère IMP##### si aucun code métier n’est fourni", () => {
    const result = normalizeClientImportRow(
      {
        nomComplet: "Sans Code",
        agence: "ABOBO",
      },
      4,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.code).toBe("IMP00004");
    expect(result.value.cniNumero.startsWith("CNI-")).toBe(true);
  });

  it("déduit le nom depuis Contact si Nom complet est absent", () => {
    const result = normalizeClientImportRow(
      {
        Contact: "Awa Koné",
        Agence: "ABOBO",
        "N° Distributeur": "D1",
      },
      2,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nomComplet).toBe("Awa Koné");
  });

  it("récupère un nom depuis une colonne métier non standard", () => {
    const result = normalizeClientImportRow(
      {
        "Nom du concessionnaire": "Kouassi Yao",
        Agence: "ABOBO",
        "N° TPM": "T9",
      },
      2,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nomComplet).toBe("Kouassi Yao");
  });

  it("refuse une catégorie inconnue", () => {
    const result = normalizeClientImportRow({
      code: "000045",
      categorie: "AUTRE",
      nomComplet: "Jean",
      cniNumero: "CNI112233",
      agence: "ABOBO",
    });
    expect(result.ok).toBe(false);
  });
});

describe("resolveAgenceFromImportToken", () => {
  it("résout par code, libellé ou id", () => {
    expect(resolveAgenceFromImportToken("ABOBO", agences)?._id).toBe(agences[0]!._id);
    expect(resolveAgenceFromImportToken("Agence Abobo", agences)?._id).toBe(agences[0]!._id);
    expect(resolveAgenceFromImportToken(agences[0]!._id!, agences)?._id).toBe(agences[0]!._id);
    expect(resolveAgenceFromImportToken("INCONNUE", agences)).toBeNull();
  });
});
