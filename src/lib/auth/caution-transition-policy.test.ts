import { describe, expect, it } from "vitest";

import {
  canFinalizeCaution,
  canValidateCautionN1,
  canValidateCautionN2,
  resolveCautionCorrectionReturnLevel,
} from "@/lib/auth/caution-transition-policy";

describe("politique de transition des cautions", () => {
  it("réserve chaque validation à son étape courante", () => {
    expect(canValidateCautionN1("CHEF_SECTION", "EN_ATTENTE")).toBe(true);
    expect(canValidateCautionN1("CHEF_SECTION", "A_CORRIGER")).toBe(false);
    expect(canValidateCautionN2("ASSIST_CDS", "VALIDE_N1")).toBe(true);
    expect(canValidateCautionN2("ASSIST_CDS", "EN_ATTENTE")).toBe(false);
    expect(canFinalizeCaution("CHEF_SERVICE", "VALIDE_N2")).toBe(true);
    expect(canFinalizeCaution("CHEF_SERVICE", "VALIDE_N1")).toBe(false);
  });

  it("attribue le retour correction uniquement au propriétaire de l'étape", () => {
    expect(resolveCautionCorrectionReturnLevel("CHEF_SECTION", "EN_ATTENTE")).toBe("N1");
    expect(resolveCautionCorrectionReturnLevel("ASSIST_CDS", "VALIDE_N1")).toBe("N2");
    expect(resolveCautionCorrectionReturnLevel("CHEF_SERVICE", "VALIDE_N2")).toBe(
      "FINALISATION",
    );
    expect(resolveCautionCorrectionReturnLevel("CHEF_SECTION", "VALIDE_N1")).toBeNull();
    expect(resolveCautionCorrectionReturnLevel("ASSIST_CDS", "A_CORRIGER")).toBeNull();
  });
});
