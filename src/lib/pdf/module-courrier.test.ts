import { describe, expect, it } from "vitest";

import { MODULE_COURRIER_DEFAULTS } from "@/lib/lonaci/module-courrier-defaults";
import {
  applyModuleCourrierTemplate,
  buildModuleCourrierContext,
} from "@/lib/lonaci/module-courrier-interpolation";
import { countPdfPages, renderModuleCourrierPdf } from "@/lib/pdf/module-courrier";

const sampleView = {
  reference: "DOS-000001",
  generatedAt: new Date("2026-09-01T10:00:00.000Z"),
  expediteur: {
    nom: "Kouassi",
    prenoms: "Jean Paul",
    contacts: "+225 07 00 00 00 00 · jean@example.com",
    codeTerminal: "TRM-001",
  },
  destinataire: "Monsieur le Directeur Général\nLONACI",
  objet: "Demande d'attestation de revenus",
  corps: `Madame, Monsieur le Directeur Général,

Par la présente, je sollicite la délivrance d'une attestation.

Cordialement.`,
  signatureLabel: "Signature de l'intéressé(e)",
  signatureName: "Jean Paul Kouassi",
};

describe("renderModuleCourrierPdf", () => {
  it("génère un PDF premium non vide", async () => {
    const buffer = await renderModuleCourrierPdf(sampleView);

    expect(buffer.length).toBeGreaterThan(800);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("tient sur une seule page pour un courrier standard", async () => {
    const buffer = await renderModuleCourrierPdf(sampleView);
    expect(countPdfPages(buffer)).toBe(1);
  });

  it("tient sur une seule page avec les modèles par défaut des modules", async () => {
    const context = buildModuleCourrierContext({
      reference: "DOS-000042",
      nom: "Kouassi",
      prenoms: "Jean Paul",
      nomComplet: "Jean Paul Kouassi",
      telephone: "+225 07 00 00 00 00",
      email: "jean@example.com",
      codeTerminal: "TRM-042",
      codePdv: "TRM-042",
      agence: "Agence Plateau",
      ville: "Abidjan",
      generatedAt: new Date("2026-09-01T10:00:00.000Z"),
    });

    for (const template of Object.values(MODULE_COURRIER_DEFAULTS)) {
      const interpolated = applyModuleCourrierTemplate(template, context);
      const buffer = await renderModuleCourrierPdf({
        ...sampleView,
        reference: context.reference,
        destinataire: interpolated.destinataire,
        objet: interpolated.objet,
        corps: interpolated.corps,
        signatureLabel: interpolated.signatureLabel,
      });

      expect(countPdfPages(buffer)).toBe(1);
    }
  });
});
