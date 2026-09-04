import { describe, expect, it } from "vitest";

import {
  buildAttestationDomiciliationDocumentChecklist,
  isAttestationDomiciliationChecklistComplete,
  patchAttestationDomiciliationDocumentChecklistStatuts,
} from "@/lib/lonaci/attestation-domiciliation-document-checklist";
import { attestationDomiciliationChecklistProgress } from "@/lib/lonaci/attestations-domiciliation-checklist-progress";
import { ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS } from "@/lib/lonaci/attestation-domiciliation-checklist-defaults";

describe("cochage checklist attestation / domiciliation", () => {
  it("coche une pièce : statut FOURNI et progression 1/N", () => {
    const checklist = buildAttestationDomiciliationDocumentChecklist(
      ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS,
    );
    const firstId = checklist.entries[0]!.itemId;

    const patched = patchAttestationDomiciliationDocumentChecklistStatuts(checklist, [
      { itemId: firstId, statut: "FOURNI" },
    ]);

    expect(patched.entries.find((e) => e.itemId === firstId)?.statut).toBe("FOURNI");
    expect(patched.complet).toBe(false);

    const progress = attestationDomiciliationChecklistProgress(patched);
    expect(progress.obligatoiresFournis).toBe(1);
    expect(progress.obligatoiresTotal).toBe(5);
    expect(progress.complet).toBe(false);
  });

  it("décoche une pièce : repasse en EN_ATTENTE", () => {
    const checklist = buildAttestationDomiciliationDocumentChecklist(
      ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS,
    );
    const firstId = checklist.entries[0]!.itemId;

    const checked = patchAttestationDomiciliationDocumentChecklistStatuts(checklist, [
      { itemId: firstId, statut: "FOURNI" },
    ]);
    const unchecked = patchAttestationDomiciliationDocumentChecklistStatuts(checked, [
      { itemId: firstId, statut: "EN_ATTENTE" },
    ]);

    expect(unchecked.entries.find((e) => e.itemId === firstId)?.statut).toBe("EN_ATTENTE");
    expect(isAttestationDomiciliationChecklistComplete(unchecked)).toBe(false);
  });

  it("dossier complet uniquement si toutes les obligatoires sont cochées", () => {
    const checklist = buildAttestationDomiciliationDocumentChecklist(
      ATTESTATION_DOMICILIATION_CHECKLIST_DEFAULT_ITEMS,
    );
    const fourOfFive = patchAttestationDomiciliationDocumentChecklistStatuts(
      checklist,
      checklist.entries.slice(0, 4).map((e) => ({ itemId: e.itemId, statut: "FOURNI" as const })),
    );
    expect(fourOfFive.complet).toBe(false);

    const all = patchAttestationDomiciliationDocumentChecklistStatuts(
      checklist,
      checklist.entries.map((e) => ({ itemId: e.itemId, statut: "FOURNI" as const })),
    );
    expect(all.complet).toBe(true);
    expect(attestationDomiciliationChecklistProgress(all).complet).toBe(true);
  });
});
