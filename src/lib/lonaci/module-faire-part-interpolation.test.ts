import { describe, expect, it } from "vitest";

import { FAIRE_PART_DEFAULT_TEMPLATES } from "@/lib/lonaci/module-faire-part-defaults";
import {
  applyFairePartTemplate,
  buildFairePartContext,
  interpolateFairePartText,
} from "@/lib/lonaci/module-faire-part-interpolation";
import { countPdfPages, renderModuleCourrierPdf } from "@/lib/pdf/module-courrier";

describe("module-faire-part-interpolation", () => {
  const context = buildFairePartContext({
    nom: "Traoré",
    prenoms: "Aïcha",
    nomComplet: "Aïcha Traoré",
    telephone: "+225 07 11 22 33 44",
    email: "aicha@example.com",
    codeTerminal: "TRM-100",
    codePdv: "PDV-100",
    reference: "SUC-000001",
    agence: "01 — Plateau",
    ville: "Abidjan",
    generatedAt: new Date("2026-09-01T10:00:00.000Z"),
    defunt: "Kouassi Jean",
    dateDecesRaw: new Date("2026-08-15T00:00:00.000Z"),
    ayantDroit: "Aïcha Traoré",
    lienParente: "Épouse",
  });

  it("injecte les variables défunt et date de décès", () => {
    const text = interpolateFairePartText(
      "Faire-part pour {{defunt}} décédé le {{dateDecesLong}} — {{reference}}",
      context,
    );
    expect(text).toContain("Kouassi Jean");
    expect(text).toContain("15");
    expect(text).toContain("2026");
    expect(text).toContain("SUC-000001");
  });

  it("ajoute le suffixe de parenté quand renseigné", () => {
    const withLien = interpolateFairePartText("Ayant droit{{lienParenteSuffix}}", context);
    expect(withLien).toBe("Ayant droit (Épouse)");

    const without = interpolateFairePartText(
      "Ayant droit{{lienParenteSuffix}}",
      buildFairePartContext({
        ...context,
        lienParente: "",
        dateDecesRaw: null,
      }),
    );
    expect(without).toBe("Ayant droit");
  });

  it("applique le modèle demande par défaut", () => {
    const applied = applyFairePartTemplate(FAIRE_PART_DEFAULT_TEMPLATES.demande, context);
    expect(applied.objet).toContain("ayant droit");
    expect(applied.objet).toContain("SUC-000001");
    expect(applied.corps).toContain("Aïcha Traoré");
    expect(applied.corps).toContain("Kouassi Jean");
    expect(applied.signatureLabel).toContain("ayant droit");
  });

  it("applique le modèle faire-part DR adressé au Directeur Régional", () => {
    const applied = applyFairePartTemplate(FAIRE_PART_DEFAULT_TEMPLATES.dr, context);
    expect(applied.destinataire).toContain("Directeur Régional");
    expect(applied.objet).toContain("Kouassi Jean");
    expect(applied.corps).toContain("triste devoir");
    expect(applied.corps).toContain("TRM-100");
    expect(applied.signatureLabel).toContain("Chef de Service");
  });
});

describe("faire-part PDF", () => {
  it("génère un PDF d'une page pour le faire-part DR", async () => {
    const buffer = await renderModuleCourrierPdf({
      reference: "SUC-000001",
      generatedAt: new Date("2026-09-01T10:00:00.000Z"),
      expediteur: {
        nom: "LONACI",
        prenoms: "01 — Plateau",
        contacts: "—",
        codeTerminal: "TRM-100",
      },
      destinataire: "Monsieur le Directeur Régional\nLONACI",
      objet: "Faire-part — décès du concessionnaire Kouassi Jean — réf. SUC-000001",
      corps: `Monsieur le Directeur Régional,

Nous avons le triste devoir de vous faire part du décès de Kouassi Jean.

Cordialement.`,
      signatureLabel: "Le Chef de Service",
      signatureName: "LONACI",
      documentTitle: "Faire-part",
      documentLabel: "FAIRE-PART · DR",
      documentKind: "LONACI_FAIRE_PART_DR",
      expediteurLabel: "SERVICE LONACI",
    });

    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(countPdfPages(buffer)).toBe(1);
  });
});
