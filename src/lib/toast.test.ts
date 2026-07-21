import { describe, expect, it } from "vitest";

import { toastMessageFromError } from "@/lib/toast";

describe("toastMessageFromError", () => {
  it("normalise les codes métier connus", () => {
    expect(toastMessageFromError(new Error("DOSSIER_CHECKLIST_INCOMPLETE"))).toContain(
      "checklist documents",
    );
  });

  it("préserve un message déjà lisible", () => {
    expect(toastMessageFromError("Enregistrement terminé avec succès.")).toBe(
      "Enregistrement terminé avec succès.",
    );
  });

  it("utilise le message de repli pour une valeur inconnue", () => {
    expect(toastMessageFromError(null, "Opération impossible.")).toBe("Opération impossible.");
  });
});
