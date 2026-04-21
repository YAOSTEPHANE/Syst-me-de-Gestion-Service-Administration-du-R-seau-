import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { LONACI_SESSION_COOKIE_NAME } from "@/lib/auth/cookie-name";

function withRequestId(response: NextResponse): NextResponse {
  response.headers.set("X-Request-Id", globalThis.crypto.randomUUID());
  return response;
}

function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveCorsOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return null;
  const allowed = getAllowedOrigins();
  if (!allowed.length) {
    // En production, fail-closed : aucune origine cross-site sans whitelist explicite.
    if (process.env.NODE_ENV === "production") return "";
    return origin;
  }
  return allowed.includes(origin) ? origin : "";
}

function applyCorsHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const resolvedOrigin = resolveCorsOrigin(request);
  if (resolvedOrigin === "") return response;
  if (!resolvedOrigin) return response;
  response.headers.set("Access-Control-Allow-Origin", resolvedOrigin);
  response.headers.set("Vary", "Origin");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    request.headers.get("access-control-request-headers") ?? "Content-Type, Authorization",
  );
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const g = globalThis as typeof globalThis & {
  __lonaciProxyRateLimitBuckets?: Map<string, RateLimitBucket>;
};

function getRateLimitBuckets(): Map<string, RateLimitBucket> {
  if (!g.__lonaciProxyRateLimitBuckets) {
    g.__lonaciProxyRateLimitBuckets = new Map<string, RateLimitBucket>();
  }
  return g.__lonaciProxyRateLimitBuckets;
}

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const RL_AUTH_MAX = parseIntEnv("PROXY_RATE_LIMIT_AUTH_MAX", 20);
const RL_PUBLIC_MAX = parseIntEnv("PROXY_RATE_LIMIT_PUBLIC_MAX", 120);
const RL_PRIVATE_MAX = parseIntEnv("PROXY_RATE_LIMIT_PRIVATE_MAX", 300);
const RL_WINDOW_MS = parseIntEnv("PROXY_RATE_LIMIT_WINDOW_MS", 60_000);

function consumeProxyRateLimit(request: NextRequest, keyKind: "auth" | "public" | "private"): number | null {
  if (request.method === "OPTIONS") return null;
  const max = keyKind === "auth" ? RL_AUTH_MAX : keyKind === "public" ? RL_PUBLIC_MAX : RL_PRIVATE_MAX;
  const now = Date.now();
  const windowKey = `${keyKind}:${getClientIp(request)}:${Math.floor(now / RL_WINDOW_MS)}`;
  const buckets = getRateLimitBuckets();

  // Cleanup opportuniste léger.
  if (buckets.size > 2000) {
    for (const [k, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(k);
    }
  }

  const existing = buckets.get(windowKey);
  if (!existing || existing.resetAt <= now) {
    buckets.set(windowKey, { count: 1, resetAt: now + RL_WINDOW_MS });
    return null;
  }
  if (existing.count >= max) {
    return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  }
  existing.count += 1;
  return null;
}

/**
 * Chemins API accessibles sans cookie de session (aligné avec
 * `src/config/public-api-routes.ts` — exécuter `npm run check:api-routes` en CI).
 */
function isPublicApiPath(pathname: string): boolean {
  if (pathname === "/api/health") return true;
  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout") return true;
  if (pathname.startsWith("/api/auth/reset-password")) return true;
  if (pathname === "/api/cron/daily-jobs") return true;
  if (pathname.startsWith("/api/signatures/dossier/")) return true;
  return false;
}

type ApiVersion = "v1" | "v2";

function resolveVersionedApiPath(pathname: string): {
  apiVersion: ApiVersion | null;
  effectivePathname: string;
} {
  if (pathname === "/api/v1" || pathname.startsWith("/api/v1/")) {
    return {
      apiVersion: "v1",
      effectivePathname: pathname.replace(/^\/api\/v1(?=\/|$)/, "/api"),
    };
  }
  if (pathname === "/api/v2" || pathname.startsWith("/api/v2/")) {
    return {
      apiVersion: "v2",
      effectivePathname: pathname.replace(/^\/api\/v2(?=\/|$)/, "/api"),
    };
  }
  return { apiVersion: null, effectivePathname: pathname };
}

export function proxy(request: NextRequest) {
  if (request.method === "TRACE" || request.method === "TRACK") {
    return applyCorsHeaders(request, withRequestId(new NextResponse(null, { status: 405 })));
  }

  const { pathname } = request.nextUrl;
  const { apiVersion, effectivePathname } = resolveVersionedApiPath(pathname);

  if (!pathname.startsWith("/api/")) {
    return withRequestId(NextResponse.next());
  }

  if (request.method === "OPTIONS") {
    const originStatus = resolveCorsOrigin(request);
    if (originStatus === "") {
      return withRequestId(
        NextResponse.json({ message: "Origine non autorisée" }, { status: 403 }),
      );
    }
    const preflightResponse = applyCorsHeaders(request, withRequestId(new NextResponse(null, { status: 204 })));
    if (apiVersion) {
      preflightResponse.headers.set("X-Api-Version", apiVersion);
    }
    return preflightResponse;
  }

  if (effectivePathname !== "/api/health") {
    const keyKind: "auth" | "public" | "private" =
      effectivePathname.startsWith("/api/auth/") ? "auth" : isPublicApiPath(effectivePathname) ? "public" : "private";
    const retryAfterSec = consumeProxyRateLimit(request, keyKind);
    if (retryAfterSec) {
      const limited = NextResponse.json(
        { message: "Trop de requêtes", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
      );
      return applyCorsHeaders(request, withRequestId(limited));
    }
  }

  if (isPublicApiPath(effectivePathname)) {
    const response = apiVersion
      ? NextResponse.rewrite(new URL(`${effectivePathname}${request.nextUrl.search}`, request.url))
      : NextResponse.next();
    const wrapped = applyCorsHeaders(request, withRequestId(response));
    if (apiVersion) {
      wrapped.headers.set("X-Api-Version", apiVersion);
    }
    return wrapped;
  }

  const token = request.cookies.get(LONACI_SESSION_COOKIE_NAME)?.value;
  if (!token?.trim()) {
    return applyCorsHeaders(
      request,
      withRequestId(NextResponse.json({ message: "Non authentifié" }, { status: 401 })),
    );
  }

  const response = apiVersion
    ? NextResponse.rewrite(new URL(`${effectivePathname}${request.nextUrl.search}`, request.url))
    : NextResponse.next();
  const wrapped = applyCorsHeaders(request, withRequestId(response));
  if (apiVersion) {
    wrapped.headers.set("X-Api-Version", apiVersion);
  }
  return wrapped;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
