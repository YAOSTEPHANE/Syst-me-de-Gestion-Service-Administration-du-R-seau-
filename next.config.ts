import type { NextConfig } from "next";

/** CSP en observation uniquement : n’applique pas de blocage, permet d’affiner la politique sans casser l’app. */
const cspDirectives = [
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

/** À `true` au build : applique `Content-Security-Policy` (bloquant) au lieu de Report-Only. */
const cspEnforce = process.env.ENABLE_CSP_ENFORCE === "true";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  cspEnforce
    ? { key: "Content-Security-Policy", value: cspDirectives }
    : { key: "Content-Security-Policy-Report-Only", value: cspDirectives },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
