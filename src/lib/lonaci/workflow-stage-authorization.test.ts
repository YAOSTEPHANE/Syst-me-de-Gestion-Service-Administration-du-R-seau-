import { describe, expect, it } from "vitest";

import { assertCessionTransitionAllowed } from "@/lib/lonaci/cessions";
import { assertResiliationTransitionAllowed } from "@/lib/lonaci/resiliations";

describe("autorisation des rejets à l'étape active", () => {
  it("limite chaque rejet de cession au rôle propriétaire de la file", () => {
    expect(() =>
      assertCessionTransitionAllowed(
        "CHEF_SECTION",
        "SAISIE_AGENT",
        "REJETEE",
        "CESSION",
      ),
    ).not.toThrow();
    expect(() =>
      assertCessionTransitionAllowed(
        "CHEF_SERVICE",
        "SAISIE_AGENT",
        "REJETEE",
        "CESSION",
      ),
    ).toThrow("FORBIDDEN_TRANSITION");
    expect(() =>
      assertCessionTransitionAllowed(
        "CHEF_SECTION",
        "CONTROLE_CHEF_SECTION",
        "REJETEE",
        "CESSION",
      ),
    ).toThrow("FORBIDDEN_TRANSITION");
  });

  it("saute bien l'assistant CDS pour une délocalisation simple", () => {
    expect(() =>
      assertCessionTransitionAllowed(
        "CHEF_SERVICE",
        "CONTROLE_CHEF_SECTION",
        "REJETEE",
        "DELOCALISATION",
      ),
    ).not.toThrow();
    expect(() =>
      assertCessionTransitionAllowed(
        "ASSIST_CDS",
        "CONTROLE_CHEF_SECTION",
        "REJETEE",
        "DELOCALISATION",
      ),
    ).toThrow("FORBIDDEN_TRANSITION");
  });

  it("limite chaque rejet de résiliation au rôle propriétaire de la file", () => {
    expect(() =>
      assertResiliationTransitionAllowed(
        "ASSIST_CDS",
        "CONTROLE_CHEF_SECTION",
        "REJETEE",
      ),
    ).not.toThrow();
    expect(() =>
      assertResiliationTransitionAllowed(
        "CHEF_SERVICE",
        "CONTROLE_CHEF_SECTION",
        "REJETEE",
      ),
    ).toThrow("FORBIDDEN_TRANSITION");
    expect(() =>
      assertResiliationTransitionAllowed(
        "ASSIST_CDS",
        "VALIDATION_N2",
        "REJETEE",
      ),
    ).toThrow("FORBIDDEN_TRANSITION");
  });
});
