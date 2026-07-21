import { describe, expect, it } from "vitest";

import {
  ATTESTATION_DOMICILIATION_STATUT_DESCRIPTIONS,
  ATTESTATION_DOMICILIATION_STATUT_LABELS,
  ATTESTATION_DOMICILIATION_STATUTS_SPEC_44,
} from "@/lib/lonaci/constants";

describe("statuts de traitement des attestations", () => {
  it("expose 5 statuts avec libellés et descriptions", () => {
    expect(ATTESTATION_DOMICILIATION_STATUTS_SPEC_44).toHaveLength(5);
    expect(ATTESTATION_DOMICILIATION_STATUT_LABELS.DEMANDE_RECUE).toBe("EN COURS");
    expect(ATTESTATION_DOMICILIATION_STATUT_LABELS.VALIDE).toBe("EN RÉVISION");
    expect(ATTESTATION_DOMICILIATION_STATUT_LABELS.ENVOYE_CLIENT).toBe("ENVOYÉ CLIENT");
    expect(ATTESTATION_DOMICILIATION_STATUT_DESCRIPTIONS.TRANSMIS).toContain("DFC");
    expect(ATTESTATION_DOMICILIATION_STATUT_DESCRIPTIONS.VALIDE).toContain("révise");
  });
});
