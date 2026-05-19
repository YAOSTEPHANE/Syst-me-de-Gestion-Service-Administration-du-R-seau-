import { NextRequest, NextResponse } from "next/server";

import {
  ensureAttestationsDomiciliationIndexes,
  envoyerAttestationAuClient,
} from "@/lib/lonaci/attestations-domiciliation";
import { checkPermission } from "@/lib/auth/checkPermission";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await checkPermission(request, {
    roles: ["CHEF_SERVICE"],
    resource: "DOSSIERS",
    action: "UPDATE",
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureAttestationsDomiciliationIndexes();

  try {
    const result = await envoyerAttestationAuClient({
      id,
      role: auth.user.role,
      actorId: auth.user._id ?? "",
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "DEMANDE_NOT_FOUND") {
      return NextResponse.json({ message: "Demande introuvable." }, { status: 404 });
    }
    if (code === "FORBIDDEN_TRANSITION") {
      return NextResponse.json({ message: "Envoi reserve au Chef de service." }, { status: 403 });
    }
    if (code === "INVALID_TRANSITION") {
      return NextResponse.json(
        { message: "Validez le dossier avant l'envoi au client." },
        { status: 409 },
      );
    }
    if (code === "CLIENT_EMAIL_MISSING") {
      return NextResponse.json(
        { message: "Email du concessionnaire introuvable sur la fiche PDV." },
        { status: 422 },
      );
    }
    if (code === "SMTP_SEND_FAILED") {
      return NextResponse.json(
        { message: "Echec de l'envoi SMTP. Verifiez la configuration serveur." },
        { status: 502 },
      );
    }
    return NextResponse.json({ message: "Envoi impossible." }, { status: 500 });
  }
}
