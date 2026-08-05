import { describe, expect, it } from "vitest";

import { montantFcfaEnLettres } from "@/lib/lonaci/montant-en-lettres";

describe("montantFcfaEnLettres", () => {
  it("convertit des montants courants", () => {
    expect(montantFcfaEnLettres(0)).toBe("zéro franc CFA");
    expect(montantFcfaEnLettres(1)).toBe("un franc CFA");
    expect(montantFcfaEnLettres(21)).toBe("vingt et un francs CFA");
    expect(montantFcfaEnLettres(80)).toBe("quatre-vingts francs CFA");
    expect(montantFcfaEnLettres(100)).toBe("cent francs CFA");
    expect(montantFcfaEnLettres(200)).toBe("deux cents francs CFA");
    expect(montantFcfaEnLettres(1000)).toBe("mille francs CFA");
    expect(montantFcfaEnLettres(250_000)).toBe("deux cent cinquante mille francs CFA");
  });
});
