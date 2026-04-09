import { cookies } from "next/headers";
import { NextRequest } from "next/server";

import { LONACI_SESSION_COOKIE_NAME } from "@/lib/auth/cookie-name";
import { signSessionToken, verifySessionToken } from "@/lib/auth/jwt";
import type { SessionPayload } from "@/lib/auth/jwt";

export { LONACI_SESSION_COOKIE_NAME };
export const SESSION_COOKIE_NAME = LONACI_SESSION_COOKIE_NAME;

export async function createSessionCookie(payload: SessionPayload) {
  const token = await signSessionToken(payload);
  const cookieStore = await cookies();

  cookieStore.set(LONACI_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Cookie de session navigateur (pas persistant) :
    // à la fermeture du navigateur, la session est ré-authentifiée au prochain lancement.
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(LONACI_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(LONACI_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(LONACI_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}
