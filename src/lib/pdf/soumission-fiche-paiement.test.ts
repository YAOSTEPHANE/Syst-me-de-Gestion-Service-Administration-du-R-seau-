import { describe, expect, it } from "vitest";

import {
  formatSoumissionPaiementMontant,
  SOUMISSION_FICHE_PAIEMENT_TITLE,
  SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA,
} from "@/lib/lonaci/soumission-paiement-constants";
import { renderSoumissionFichePaiementPdf } from "@/lib/pdf/soumission-fiche-paiement";

describe("soumission paiement constants", () => {
  it("fixe le montant caisse à 100 000 FCFA", () => {
    expect(SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA).toBe(100_000);
    expect(formatSoumissionPaiementMontant()).toMatch(/100[\s\u00a0]?000/);
    expect(formatSoumissionPaiementMontant()).toContain("FCFA");
    expect(SOUMISSION_FICHE_PAIEMENT_TITLE).toMatch(/paiement/i);
  });
});

describe("soumission fiche paiement PDF", () => {
  it("génère un PDF non vide avec le nom de l’agent", async () => {
    const pdf = await renderSoumissionFichePaiementPdf({
      reference: "SOU-TEST0001",
      nomComplet: "KOUASSI Jean",
      contact: "+2250700110001",
      typeDistributeurLabel: "Nouveau",
      nombreTpe: 1,
      agenceLabel: "ABJ — Agence Abidjan Plateau",
      montantFCFA: SOUMISSION_PAIEMENT_CAISSE_MONTANT_FCFA,
      agentNom: "Agent Test LONACI",
      generatedAt: new Date("2026-08-04T10:00:00.000Z").toISOString(),
      observations: "[seed-soumissions] Donnée de test PDF",
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  });
});
