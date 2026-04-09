import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { getClientIp } from "@/lib/security/client-ip";
import { consumeRateLimit } from "@/lib/security/mongo-rate-limit";

export function tooManyRequestsResponse(retryAfterSec: number, message = "Trop de requêtes. Réessayez plus tard.") {
  return NextResponse.json(
    { message },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

export async function enforceRateLimit(
  request: NextRequest,
  options: {
    namespace: string;
    max: number;
    windowMs: number;
    keyPrefix?: string;
    message?: string;
  },
): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const key = options.keyPrefix ? `${options.keyPrefix}:${ip}` : ip;
  const result = await consumeRateLimit(options.namespace, key, options.max, options.windowMs);
  if (result.allowed) return null;
  return tooManyRequestsResponse(result.retryAfterSec, options.message);
}

export function zodBadRequest(error: z.ZodError, message = "Donnees invalides") {
  return badRequest(message, "VALIDATION_ERROR", error.issues);
}

