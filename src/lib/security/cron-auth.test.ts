import { describe, expect, it } from "vitest";

import { verifyCronSecretFromHeaders } from "./cron-auth";

describe("verifyCronSecretFromHeaders", () => {
  it("refuse si secret absent ou vide", () => {
    expect(
      verifyCronSecretFromHeaders("Bearer abc", null, undefined),
    ).toBe(false);
    expect(verifyCronSecretFromHeaders("Bearer abc", null, "   ")).toBe(false);
  });

  it("accepte Authorization Bearer correct", () => {
    expect(
      verifyCronSecretFromHeaders("Bearer mon-secret", null, "mon-secret"),
    ).toBe(true);
    expect(
      verifyCronSecretFromHeaders("Bearer wrong", null, "mon-secret"),
    ).toBe(false);
  });

  it("accepte x-cron-secret correct", () => {
    expect(
      verifyCronSecretFromHeaders(null, "autre-secret", "autre-secret"),
    ).toBe(true);
    expect(
      verifyCronSecretFromHeaders(null, "wrong", "autre-secret"),
    ).toBe(false);
  });
});
