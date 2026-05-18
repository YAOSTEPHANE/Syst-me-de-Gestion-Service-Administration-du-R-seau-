import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LONACI_SESSION_COOKIE_NAME } from "@/lib/auth/cookie-name";
import { isSameSiteOriginForCsrf, proxy } from "@/proxy";

function reqWithOriginUrl(originUrl: string): NextRequest {
  return { nextUrl: { origin: originUrl } } as NextRequest;
}

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

  it("CSRF : refuse une origine externe (POST authentifié)", () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "");

    const req = new NextRequest("http://localhost:3000/api/cautions/etat-attendus-montants", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        cookie: `${LONACI_SESSION_COOKIE_NAME}=x`,
      },
    });

    const res = proxy(req);
    expect(res.status).toBe(403);
  });

  it("CSRF : accepte Origin whitelistée même si nextUrl est interne", () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://app.lonaci.ci");

    const req = new NextRequest("http://127.0.0.1:3000/api/cautions/etat-attendus-montants", {
      method: "POST",
      headers: {
        origin: "https://app.lonaci.ci",
        cookie: `${LONACI_SESSION_COOKIE_NAME}=x`,
      },
    });

    const res = proxy(req);
    expect(res.status).not.toBe(403);
  });
});

describe("isSameSiteOriginForCsrf", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("considère équivalents loopback uniquement si NODE_ENV=development (Host vs Origin réels)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "");
    const req = reqWithOriginUrl("http://127.0.0.1:3000");
    expect(isSameSiteOriginForCsrf("http://localhost:3000", req)).toBe(true);
  });

  it("ne considère pas équivalents loopback hors dev", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "");
    const req = reqWithOriginUrl("http://127.0.0.1:3000");
    expect(isSameSiteOriginForCsrf("http://localhost:3000", req)).toBe(false);
  });

  it("accepte une origine listée dans CORS_ALLOWED_ORIGINS", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://app.lonaci.ci");
    const req = reqWithOriginUrl("http://127.0.0.1:3000");
    expect(isSameSiteOriginForCsrf("https://app.lonaci.ci", req)).toBe(true);
  });
});
