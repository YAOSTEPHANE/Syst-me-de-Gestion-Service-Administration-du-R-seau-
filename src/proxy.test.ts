import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

describe("proxy CORS policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuse le preflight cross-origin en production sans whitelist", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "");

    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    });

    const res = proxy(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ message: "Origine non autorisée" });
  });

  it("autorise uniquement les origines whitelistées", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://app.lonaci.ci,https://admin.lonaci.ci");

    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "OPTIONS",
      headers: {
        origin: "https://admin.lonaci.ci",
        "access-control-request-method": "POST",
      },
    });

    const res = proxy(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://admin.lonaci.ci");
  });
});
