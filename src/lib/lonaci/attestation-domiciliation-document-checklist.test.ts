import { describe, expect, it } from "vitest";

import {
  buildAttestationDomiciliationDocumentChecklist,
  isAttestationDomiciliationChecklistComplete,
  patchAttestationDomiciliationDocumentChecklistStatuts,
} from "@/lib/lonaci/attestation-domiciliation-document-checklist";
import { ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS } from "@/lib/lonaci/attestation-domiciliation-checklist-defaults";

describe("checklist attestation / domiciliation", () => {
  it("définit les 5 pièces métier attendues", () => {
    expect(ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS).toHaveLength(5);
    expect(ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS.map((i) => i.libelle)).toEqual(
      expect.arrayContaining([
        "Original du relevé d'identité bancaire",
        "Copie de la première et de la dernière page du contrat",
        "Copie de la première et de la dernière page de l'annexe",
        "Origine et copie couleur de la CNI en cours de validité",
        "Courrier d'attestation de revenus et de domiciliation addressé au DG",
      ]),
    );
  });

  it("marque le dossier complet lorsque toutes les pièces obligatoires sont fournies", () => {
    const checklist = buildAttestationDomiciliationDocumentChecklist(ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS);
    const patched = patchAttestationDomiciliationDocumentChecklistStatuts(
      checklist,
      checklist.entries.map((e) => ({ itemId: e.itemId, statut: "FOURNI" as const })),
    );
    expect(isAttestationDomiciliationChecklistComplete(patched)).toBe(true);
    expect(patched.complet).toBe(true);
  });
});
