import type { NextConfig } from "next";

/** CSP observée (report-only) pour calibration progressive. */
const cspReportOnlyDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** CSP bloquante (enforce) plus stricte pour la production. */
const cspEnforcedDirectives = [
  "default-src 'self'",
  // Next.js injecte des scripts inline (runtime/hydratation) : sans nonce/hashes, il faut autoriser unsafe-inline.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** À `true` au build : applique `Content-Security-Policy` (bloquant) au lieu de Report-Only. */
const cspEnforce = process.env.ENABLE_CSP_ENFORCE !== "false" && process.env.NODE_ENV === "production";
const firstAllowedCorsOrigin = process.env.CORS_ALLOWED_ORIGINS
  ?.split(",")
  .map((v) => v.trim())
  .find(Boolean);

const securityHeaders = [
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
    : []),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  cspEnforce
    ? { key: "Content-Security-Policy", value: cspEnforcedDirectives }
    : { key: "Content-Security-Policy-Report-Only", value: cspReportOnlyDirectives },
];

/**
 * CORS de base sur /api (fallback statique) :
 * la logique dynamique multi-origines et preflight reste dans src/proxy.ts.
 */
const apiCorsHeaders = [
  { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Requested-With" },
  { key: "Vary", value: "Origin" },
  ...(firstAllowedCorsOrigin
    ? [
        { key: "Access-Control-Allow-Origin", value: firstAllowedCorsOrigin },
        { key: "Access-Control-Allow-Credentials", value: "true" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  outputFileTracingExcludes: {
    "/api/admin/backups/restore": ["./next.config.ts"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: apiCorsHeaders },
    ];
  },
};

export default nextConfig;
