import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getDossierSignatureByToken,
  signDossierByToken,
} from "@/lib/lonaci/dossier-signatures";
import { findDossierById } from "@/lib/lonaci/dossiers";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { getClientIp } from "@/lib/security/client-ip";
import { consumeRateLimit } from "@/lib/security/mongo-rate-limit";

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
  const ip = getClientIp(request);
  const rl = await consumeRateLimit("signatures-dossier-get", ip, 120, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { token } = await context.params;
  const signature = await getDossierSignatureByToken(token);
  if (!signature) {
    return NextResponse.json({ message: "Lien invalide." }, { status: 404 });
  }

  const dossier = await findDossierById(signature.dossierId);
  if (!dossier || dossier.deletedAt) {
    return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
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
  const ip = getClientIp(request);
  const rl = await consumeRateLimit("signatures-dossier-post", ip, 40, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "Trop de tentatives. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { token } = await context.params;
  const parsed = signSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Données invalides", issues: parsed.error.issues }, { status: 400 });
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
      return NextResponse.json({ message: "Lien invalide." }, { status: 404 });
    }
    if (code === "SIGN_ALREADY_DONE") {
      return NextResponse.json({ message: "Ce dossier est déjà signé." }, { status: 409 });
    }
    if (code === "SIGN_TOKEN_EXPIRED") {
      return NextResponse.json({ message: "Le lien de signature a expiré." }, { status: 410 });
    }
    if (code === "DOSSIER_NOT_FOUND") {
      return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
    }
    return NextResponse.json({ message: "Impossible d'enregistrer la signature." }, { status: 500 });
  }
}
