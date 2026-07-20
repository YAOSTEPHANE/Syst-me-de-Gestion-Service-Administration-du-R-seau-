import { describe, expect, it } from "vitest";

import {
  clientCodePrefixForAgence,
  normalizeClientCodeForAgence,
} from "@/lib/lonaci/client-constants";

describe("normalizeClientCodeForAgence", () => {
  it("préfixe le suffixe avec le code agence", () => {
    expect(normalizeClientCodeForAgence("000042", "editec")).toBe("CLI-EDITEC-000042");
  });

  it("accepte le code complet si l’agence correspond", () => {
    expect(normalizeClientCodeForAgence("CLI-EDITEC-ABC12", "EDITEC")).toBe("CLI-EDITEC-ABC12");
  });

  it("rejette un code d’une autre agence", () => {
    expect(() => normalizeClientCodeForAgence("CLI-ABJ-001", "EDITEC")).toThrow("CLIENT_CODE_AGENCE_MISMATCH");
  });

  it("rejette un suffixe vide ou invalide", () => {
    expect(() => normalizeClientCodeForAgence("", "EDITEC")).toThrow("CLIENT_CODE_INVALID");
    expect(() => normalizeClientCodeForAgence("---", "EDITEC")).toThrow("CLIENT_CODE_INVALID");
  });
});

describe("clientCodePrefixForAgence", () => {
  it("normalise le code agence en majuscules", () => {
    expect(clientCodePrefixForAgence("  abj  ")).toBe("CLI-ABJ-");
  });
});
