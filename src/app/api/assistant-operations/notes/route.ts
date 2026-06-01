import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import { createAssistantNote } from "@/lib/lonaci/assistant-operations";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(500),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...LONACI_ROLES] });
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  const display = `${auth.user.prenom ?? ""} ${auth.user.nom ?? ""}`.trim() || auth.user.email || "Utilisateur";
  const insertedId = await createAssistantNote({
    text: parsed.data.text,
    createdByUserId: auth.user._id ?? "",
    createdByDisplay: display,
  });

  return NextResponse.json({ id: insertedId }, { status: 201 });
}
