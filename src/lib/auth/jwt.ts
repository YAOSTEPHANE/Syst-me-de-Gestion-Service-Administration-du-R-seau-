import { SignJWT, jwtVerify } from "jose";

import { env } from "@/lib/env";
import type { LonaciRole } from "@/lib/lonaci/constants";

const JWT_ALG = "HS256";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export interface SessionPayload {
  sub: string;
  email: string;
  role: LonaciRole;
  sessionId: string;
}

function getSecretKey() {
  return new TextEncoder().encode(env.jwtSecret);
}

export async function signSessionToken(payload: SessionPayload) {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    sid: payload.sessionId,
  })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: [JWT_ALG] });

    if (!payload.sub || !payload.email || !payload.role || !payload.sid) {
      return null;
    }

    return {
      sub: payload.sub,
      email: String(payload.email),
      role: payload.role as LonaciRole,
      sessionId: String(payload.sid),
    };
  } catch {
    return null;
  }
}

export const sessionMaxAgeSeconds = SESSION_DURATION_SECONDS;
