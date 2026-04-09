import { NextRequest, NextResponse } from "next/server";

import type { LonaciRole } from "@/lib/lonaci/constants";
import type { RbacAction, RbacResource } from "@/lib/auth/rbac";
import { canRole } from "@/lib/auth/rbac";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  userHasConcessionnairesLectureModule,
  userHasConcessionnairesSaisieModule,
} from "@/lib/lonaci/module-concessionnaires";
import { clearCurrentSession, findUserById, setUserCurrentSession, touchSessionActivity } from "@/lib/lonaci/users";
import { logger } from "@/lib/observability/logger";

interface GuardOptions {
  roles?: LonaciRole[];
  agenceId?: string;
  produitCode?: string;
  rbac?: {
    resource: RbacResource;
    action: RbacAction;
  };
}

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

function inferModuleKeyFromPath(pathname: string): string | null {
  const p = pathname.toLowerCase();
  if (p.includes("/api/admin") || p.includes("/api/import-data")) return "ADMIN";
  if (p.includes("/api/contrats")) return "CONTRATS";
  if (p.includes("/api/dossiers")) return "DOSSIERS";
  // Référentiel PDV : contrôle fini lecture/saisie dans requireApiAuth (pas une seule clé ici).
  if (p.includes("/api/concessionnaires")) return null;
  // Bancarisation : réservée à la saisie (CONCESSIONNAIRES), traité dans requireApiAuth.
  if (p.includes("/api/bancarisation")) return null;
  if (p.includes("/api/referentials")) return "REFERENTIELS";
  if (p.includes("/api/cautions")) return "CAUTIONS";
  if (p.includes("/api/succession")) return "SUCCESSION";
  if (p.includes("/api/resiliations")) return "RESILIATIONS";
  if (p.includes("/api/pdv-integrations")) return "PDV_INTEGRATIONS";
  if (p.includes("/api/gpr-registrations")) return "LONACI_REGISTRIES";
  if (p.includes("/api/scratch-codes")) return "LONACI_REGISTRIES";
  if (p.includes("/api/attestations-domiciliation")) return "ATTESTATIONS_DOMICILIATION";
  if (p.includes("/api/lonaci-registries")) return "LONACI_REGISTRIES";
  if (p.includes("/api/reports")) return "REPORTS";
  if (p.includes("/api/dashboard")) return "DASHBOARD";
  return null;
}

function inferRbacResourceFromPath(pathname: string): RbacResource | null {
  const p = pathname.toLowerCase();
  if (p.includes("/api/concessionnaires")) return "CONCESSIONNAIRES";
  if (p.includes("/api/contrats")) return "CONTRATS";
  if (p.includes("/api/dossiers")) return "DOSSIERS";
  if (p.includes("/api/cautions")) return "CAUTIONS";
  if (p.includes("/api/pdv-integrations")) return "PDV_INTEGRATIONS";
  if (p.includes("/api/agrements")) return "AGREMENTS";
  if (p.includes("/api/reports")) return "REPORTS";
  if (p.includes("/api/admin/app-settings")) return "PARAMETRES";
  if (p.includes("/api/lonaci/alert-thresholds")) return "ALERTS";
  if (p.includes("/api/notifications")) return "NOTIFICATIONS";
  return null;
}

function inferRbacActionFromRequest(request: NextRequest): RbacAction | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return "READ";
  if (method === "POST") return "CREATE";
  if (method === "PUT" || method === "PATCH") return "UPDATE";
  if (method === "DELETE") return "DEACTIVATE";
  return null;
}

export function hasModuleAuthorization(
  modulesAutorises: string[] | null | undefined,
  moduleKey: string,
): boolean {
  if (!modulesAutorises || modulesAutorises.length === 0) return true;
  return modulesAutorises.includes("ADMIN") || modulesAutorises.includes(moduleKey);
}

export async function requireApiAuth(request: NextRequest, options?: GuardOptions) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn("Unauthorized: missing session", {
        event: "AUTH_MISSING_SESSION",
        path: request.nextUrl.pathname,
      });
    }
    return { error: NextResponse.json({ message: "Non authentifie" }, { status: 401 }) };
  }

  const user = await findUserById(session.sub);
  if (!user || !user.actif) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn("Forbidden: inactive or missing account", {
        event: "AUTH_INACTIVE_OR_MISSING_USER",
        path: request.nextUrl.pathname,
        userId: session.sub,
      });
    }
    return { error: NextResponse.json({ message: "Compte inactif ou inexistant" }, { status: 403 }) };
  }

  if (!user.currentSessionId) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn("Session id missing in DB, resync", {
        event: "AUTH_RESYNC_SESSION_ID",
        path: request.nextUrl.pathname,
        userId: session.sub,
        providedSessionId: session.sessionId,
      });
    }
    await setUserCurrentSession(session.sub, session.sessionId);
  } else if (user.currentSessionId !== session.sessionId) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn("Unauthorized: invalid session id", {
        event: "AUTH_INVALID_SESSION_ID",
        path: request.nextUrl.pathname,
        userId: session.sub,
        expectedSessionId: user.currentSessionId,
        providedSessionId: session.sessionId,
      });
    }
    return {
      error: NextResponse.json(
        { message: "Session invalide. Veuillez vous reconnecter." },
        { status: 401 },
      ),
    };
  }

  if (user.lastActivityAt && Date.now() - user.lastActivityAt.getTime() > INACTIVITY_TIMEOUT_MS) {
    if (process.env.NODE_ENV !== "production") {
      logger.warn("Unauthorized: session inactivity timeout", {
        event: "AUTH_INACTIVITY_TIMEOUT",
        path: request.nextUrl.pathname,
        userId: session.sub,
        lastActivityAt: user.lastActivityAt.toISOString(),
      });
    }
    await clearCurrentSession(user._id ?? "");
    return {
      error: NextResponse.json(
        { message: "Session expiree apres 30 minutes d'inactivite. Veuillez vous reconnecter." },
        { status: 401 },
      ),
    };
  }

  if (options?.roles && !options.roles.includes(user.role)) {
    return { error: NextResponse.json({ message: "Acces refuse" }, { status: 403 }) };
  }

  const explicitRbac = options?.rbac;
  const inferredResource = inferRbacResourceFromPath(request.nextUrl.pathname);
  const inferredAction = inferRbacActionFromRequest(request);
  const resource = explicitRbac?.resource ?? inferredResource;
  const action = explicitRbac?.action ?? inferredAction;
  if (resource && action) {
    const r = canRole({ role: user.role, resource, action });
    if (!r.allowed) {
      return { error: NextResponse.json({ message: "Acces refuse (RBAC)" }, { status: 403 }) };
    }
  }

  if (options?.agenceId) {
    // Si l’utilisateur a une liste d’agences autorisées non vide, on impose cette liste.
    if (user.agencesAutorisees && user.agencesAutorisees.length > 0) {
      if (!user.agencesAutorisees.includes(options.agenceId)) {
        return { error: NextResponse.json({ message: "Acces refuse pour cette agence" }, { status: 403 }) };
      }
    } else {
      // Fallback sur l’agences de rattachement existante (comportement historique).
      if (user.agenceId && user.agenceId !== options.agenceId) {
        return { error: NextResponse.json({ message: "Acces refuse pour cette agence" }, { status: 403 }) };
      }
    }
  }

  const pathnameLower = request.nextUrl.pathname.toLowerCase();
  if (pathnameLower.startsWith("/api/concessionnaires")) {
    const mods = user.modulesAutorises ?? [];
    if (mods.length > 0) {
      const readMethod = request.method === "GET" || request.method === "HEAD";
      if (readMethod) {
        if (!userHasConcessionnairesLectureModule(mods)) {
          return { error: NextResponse.json({ message: "Module non autorisé" }, { status: 403 }) };
        }
      } else if (!userHasConcessionnairesSaisieModule(mods)) {
        return {
          error: NextResponse.json(
            { message: "Saisie non autorisée sur le référentiel concessionnaires (profil suivi / lecture seule)." },
            { status: 403 },
          ),
        };
      }
    }
  }

  if (pathnameLower.startsWith("/api/bancarisation")) {
    const mods = user.modulesAutorises ?? [];
    if (mods.length > 0 && !userHasConcessionnairesSaisieModule(mods)) {
      return {
        error: NextResponse.json(
          {
            message:
              "Bancarisation réservée au profil saisie : ajoutez le module CONCESSIONNAIRES (pas seulement CONCESSIONNAIRES_LECTURE).",
          },
          { status: 403 },
        ),
      };
    }
  }

  // Contrôle de module autorisé (si liste de modules non vide).
  const moduleKey = inferModuleKeyFromPath(request.nextUrl.pathname);
  if (moduleKey && !hasModuleAuthorization(user.modulesAutorises, moduleKey)) {
    // Le module ADMIN agit comme surcouche d'administration transverse.
    // Un compte admin ne doit pas être bloqué sur les modules métiers (ex: CONTRATS/DOSSIERS).
    return { error: NextResponse.json({ message: "Module non autorisé" }, { status: 403 }) };
  }

  if (
    options?.produitCode &&
    user.produitsAutorises.length > 0 &&
    !user.produitsAutorises.includes(options.produitCode)
  ) {
    return { error: NextResponse.json({ message: "Acces refuse pour ce produit" }, { status: 403 }) };
  }

  await touchSessionActivity(user._id ?? "");

  return { user };
}
