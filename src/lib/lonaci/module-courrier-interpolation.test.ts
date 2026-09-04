import { describe, expect, it } from "vitest";

import {
  applyModuleCourrierTemplate,
  buildModuleCourrierContext,
  interpolateModuleCourrierText,
} from "@/lib/lonaci/module-courrier-interpolation";
import { MODULE_COURRIER_DEFAULTS } from "@/lib/lonaci/module-courrier-defaults";

describe("module courrier interpolation", () => {
  const context = buildModuleCourrierContext({
    nom: "Kouassi",
    prenoms: "Jean",
    nomComplet: "Jean Kouassi",
    telephone: "+225 07 00 00 00 00",
    email: "jean@example.com",
    codeTerminal: "TRM-001",
    codePdv: "PDV-001",
    reference: "SUC-0000001",
    agence: "ABJ — Abidjan",
    ville: "Abidjan",
    generatedAt: new Date("2026-09-01T12:00:00.000Z"),
  });

  it("remplace les variables du modèle", () => {
    const text = interpolateModuleCourrierText(
      "Dossier {{reference}} pour {{nomComplet}} ({{codeTerminal}})",
      context,
    );
    expect(text).toContain("SUC-0000001");
    expect(text).toContain("Jean Kouassi");
    expect(text).toContain("TRM-001");
  });

  it("applique le modèle par défaut succession", () => {
    const applied = applyModuleCourrierTemplate(MODULE_COURRIER_DEFAULTS.succession, context);
    expect(applied.objet).toContain("SUC-0000001");
    expect(applied.corps).toContain("Jean Kouassi");
    expect(applied.signatureLabel).toContain("intéressé");
  });
});
