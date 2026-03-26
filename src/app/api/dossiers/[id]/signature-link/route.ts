import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { createDossierSignatureLink } from "@/lib/lonaci/dossier-signatures";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  try {
    const link = await createDossierSignatureLink({
      dossierId: id,
      createdByUserId: auth.user._id ?? "",
      origin: request.nextUrl.origin,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "DOSSIER_NOT_FOUND") {
      return NextResponse.json({ message: "Dossier introuvable." }, { status: 404 });
    }
    if (code === "DOSSIER_NOT_READY_FOR_SIGNATURE") {
      return NextResponse.json(
        { message: "Le dossier doit être au statut Validé N2 pour signature client." },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: "Impossible de générer le lien de signature." }, { status: 500 });
  }
}
