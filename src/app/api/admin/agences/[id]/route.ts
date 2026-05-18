import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  deleteAgence,
  ensureReferentialsIndexes,
  formatAgenceDeleteBlockedMessage,
  updateAgence,
} from "@/lib/lonaci/referentials";

const agenceZoneSchema = z.enum(["ABIDJAN", "INTERIEUR"]);

const patchAgenceSchema = z.object({
  code: z.string().min(2).max(32),
  libelle: z.string().min(2).max(200),
  zoneGeographique: agenceZoneSchema,
  actif: z.boolean(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const parsed = patchAgenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  await ensureReferentialsIndexes();
  try {
    const agence = await updateAgence(id.trim(), parsed.data);
    if (!agence) {
      return NextResponse.json({ message: "Agence introuvable." }, { status: 404 });
    }
    return NextResponse.json({ agence }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "DUPLICATE_AGENCE_CODE") {
      return NextResponse.json({ message: "Ce code agence est deja utilise par une autre agence." }, { status: 409 });
    }
    return NextResponse.json({ message: message || "Mise a jour impossible." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  await ensureReferentialsIndexes();
  const result = await deleteAgence(id.trim());
  if (result.ok) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  if (result.reason === "not_found") {
    return NextResponse.json({ message: "Agence introuvable." }, { status: 404 });
  }
  return NextResponse.json(
    {
      message: formatAgenceDeleteBlockedMessage(result.blockers),
      blockers: result.blockers,
    },
    { status: 409 },
  );
}
