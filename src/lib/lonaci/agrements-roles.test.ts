import { describe, expect, it } from "vitest";

import { canRole } from "@/lib/auth/rbac";
import { getVisibleWorkflowStatuses, isWorkflowStageAssignedToRole } from "@/lib/auth/workflow-visibility";
import { canImportAgrementsForAgence } from "@/lib/lonaci/access";
import { canImportAgrements } from "@/lib/lonaci/agrements-roles";
import type { UserDocument } from "@/lib/lonaci/types";

function user(partial: Partial<UserDocument>): UserDocument {
  return {
    email: "a@test.com",
    passwordHash: "x",
    nom: "Test",
    prenom: "User",
    role: "ASSIST_DGVR",
    actif: true,
    agenceId: null,
    agencesAutorisees: [],
    modulesAutorises: [],
    produitsAutorises: [],
    ...partial,
  } as UserDocument;
}

describe("import des agréments par l'assistant(e) DGVR", () => {
  it("réserve l'import à l'assistant(e) DGVR et au Chef de service", () => {
    expect(canImportAgrements("ASSIST_DGVR")).toBe(true);
    expect(canImportAgrements("CHEF_SERVICE")).toBe(true);
    expect(canImportAgrements("AGENT")).toBe(false);
    expect(canImportAgrements("CHEF_SECTION")).toBe(false);
    expect(canImportAgrements("ASSIST_CDS")).toBe(false);
    expect(canImportAgrements(null)).toBe(false);
  });

  it("autorise toutes les agences pour un compte DGVR sans rattachement", () => {
    const dgvr = user({});
    expect(canImportAgrementsForAgence(dgvr, "agence-a")).toBe(true);
    expect(canImportAgrementsForAgence(dgvr, "agence-b")).toBe(true);
  });

  it("respecte la liste d'agences autorisées si elle est renseignée", () => {
    const dgvr = user({ agencesAutorisees: ["agence-a"] });
    expect(canImportAgrementsForAgence(dgvr, "agence-a")).toBe(true);
    expect(canImportAgrementsForAgence(dgvr, "agence-b")).toBe(false);
  });

  it("consulte tous les statuts d'agrément sans file de validation", () => {
    expect(getVisibleWorkflowStatuses("AGREMENTS", "ASSIST_DGVR")).toEqual([
      "RECU",
      "CONTROLE",
      "TRANSMIS",
      "FINALISE",
    ]);
    expect(getVisibleWorkflowStatuses("DOSSIERS", "ASSIST_DGVR")).toEqual([]);
    expect(
      isWorkflowStageAssignedToRole({ workflow: "AGREMENTS", role: "ASSIST_DGVR", status: "RECU" }),
    ).toBe(false);
  });

  it("n'a aucun droit de validation ni d'accès aux autres modules", () => {
    expect(canRole({ role: "ASSIST_DGVR", resource: "AGREMENTS", action: "READ" }).allowed).toBe(true);
    expect(canRole({ role: "ASSIST_DGVR", resource: "AGREMENTS", action: "CREATE" }).allowed).toBe(true);
    expect(canRole({ role: "ASSIST_DGVR", resource: "AGREMENTS", action: "FINALIZE" }).allowed).toBe(false);
    expect(canRole({ role: "ASSIST_DGVR", resource: "DOSSIERS", action: "READ" }).allowed).toBe(false);
    expect(canRole({ role: "ASSIST_DGVR", resource: "PARAMETRES", action: "CONFIGURE" }).allowed).toBe(false);
  });
});
