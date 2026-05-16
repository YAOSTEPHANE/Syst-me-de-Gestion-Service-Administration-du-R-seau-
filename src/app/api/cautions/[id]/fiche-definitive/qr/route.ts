import { NextRequest, NextResponse } from "next/server";

import { notFound, serverError } from "@/lib/api/error-responses";
import {
  buildCautionFicheDefinitiveView,
  isCautionFpdQrEnabled,
  renderCautionFicheDefinitiveQrPng,
} from "@/lib/lonaci/caution-fiche-definitive";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    rbac: { resource: "CAUTIONS", action: "READ" },
  });
  if ("error" in auth) return auth.error;

  if (!isCautionFpdQrEnabled()) {
    return new NextResponse(null, { status: 204 });
  }

  const { id } = await context.params;
  try {
    const view = await buildCautionFicheDefinitiveView(id);
    if (!view) {
      return notFound("Fiche definitive introuvable.", "FICHE_DEFINITIVE_NOT_FOUND");
    }
    const png = await renderCautionFicheDefinitiveQrPng(view);
    if (!png) {
      return new NextResponse(null, { status: 204 });
    }
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return serverError("QR code indisponible.", "FICHE_DEFINITIVE_QR_FAILED");
  }
}
