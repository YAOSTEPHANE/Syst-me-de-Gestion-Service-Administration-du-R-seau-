import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { conflict, gone, notFound, serverError } from "@/lib/api/error-responses";
import { enforceRateLimit, zodBadRequest } from "@/lib/api/endpoint-helpers";
import {
  getDossierSignatureByToken,
  signDossierByToken,
} from "@/lib/lonaci/dossier-signatures";
import { findDossierById } from "@/lib/lonaci/dossiers";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { getClientIp } from "@/lib/security/client-ip";

interface RouteContext {
  params: Promise<{ token: string }>;
}

const signSchema = z.object({
  signerName: z.string().min(2).max(120),
  accepted: z.literal(true),
});

function getIpAddress(request: NextRequest): string | null {
  const ip = getClientIp(request);
  return ip === "unknown" ? null : ip;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await enforceRateLimit(request, {
    namespace: "signatures-dossier-get",
    max: 120,
    windowMs: 15 * 60 * 1000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const { token } = await context.params;
  const signature = await getDossierSignatureByToken(token);
  if (!signature) {
    return notFound("Lien invalide.", "SIGN_TOKEN_INVALID");
  }

  const dossier = await findDossierById(signature.dossierId);
  if (!dossier || dossier.deletedAt) {
    return notFound("Dossier introuvable.", "DOSSIER_NOT_FOUND");
  }
  const concessionnaire = await findConcessionnaireById(dossier.concessionnaireId);

  return NextResponse.json(
    {
      signature: {
        status: signature.status,
        expiresAt: signature.expiresAt.toISOString(),
        signedAt: signature.signedAt?.toISOString() ?? null,
        signerName: signature.signerName,
      },
      dossier: {
        id: dossier._id,
        reference: dossier.reference,
        status: dossier.status,
        produitCode: String(dossier.payload.produitCode ?? ""),
        dateOperation: String(dossier.payload.dateOperation ?? ""),
      },
      concessionnaire: concessionnaire
        ? {
            codePdv: concessionnaire.codePdv,
            nomComplet: concessionnaire.nomComplet,
            raisonSociale: concessionnaire.raisonSociale,
          }
        : null,
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await enforceRateLimit(request, {
    namespace: "signatures-dossier-post",
    max: 40,
    windowMs: 60 * 60 * 1000,
    message: "Trop de tentatives. Réessayez plus tard.",
  });
  if (rateLimitResponse) return rateLimitResponse;

  const { token } = await context.params;
  const parsed = signSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Données invalides");
  }

  try {
    const result = await signDossierByToken({
      token,
      signerName: parsed.data.signerName.trim(),
      signerIp: getIpAddress(request),
      signerUserAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json(
      {
        message: "Signature enregistrée avec succès.",
        result: {
          dossierId: result.dossierId,
          reference: result.reference,
          signerName: result.signerName,
          signedAt: result.signedAt.toISOString(),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "SIGN_TOKEN_INVALID") {
      return notFound("Lien invalide.", "SIGN_TOKEN_INVALID");
    }
    if (code === "SIGN_ALREADY_DONE") {
      return conflict("Ce dossier est déjà signé.", "SIGN_ALREADY_DONE");
    }
    if (code === "SIGN_TOKEN_EXPIRED") {
      return gone("Le lien de signature a expiré.", "SIGN_TOKEN_EXPIRED");
    }
    if (code === "DOSSIER_NOT_FOUND") {
      return notFound("Dossier introuvable.", "DOSSIER_NOT_FOUND");
    }
    return serverError("Impossible d'enregistrer la signature.", "SIGNATURE_SAVE_FAILED");
  }
}
