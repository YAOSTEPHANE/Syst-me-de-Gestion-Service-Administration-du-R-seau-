import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { notFound, serverError } from "@/lib/api/error-responses";
import { canReadClientDirectory } from "@/lib/lonaci/access";
import { findClientById, rejectClientCreationN1, sanitizeClientPublic } from "@/lib/lonaci/clients";
import { requireApiAuth } from "@/lib/auth/guards";

const schema = z.object({
  motif: z.string().min(3).max(2000),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION"],
    rbac: { resource: "CLIENTS", action: "REJECT" },
  });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return zodBadRequest(parsed.error);

  const { id } = await context.params;
  const existing = await findClientById(id);
  if (!existing || existing.deletedAt) {
    return notFound("Client introuvable.", "CLIENT_NOT_FOUND");
  }
  if (!(await canReadClientDirectory(auth.user, existing))) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  try {
    const row = await rejectClientCreationN1(id, parsed.data.motif, auth.user);
    return NextResponse.json({ ok: true, client: sanitizeClientPublic(row) }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CLIENT_NOT_FOUND") return notFound("Client introuvable.", "CLIENT_NOT_FOUND");
    if (code === "CLIENT_REJET_MOTIF_REQUIS") {
      return NextResponse.json({ message: "Motif de rejet requis (3 caractères min).", code }, { status: 400 });
    }
    if (code === "ROLE_FORBIDDEN" || code === "CLIENT_WRONG_STATUS") {
      return NextResponse.json({ message: "Transition non autorisee.", code }, { status: 403 });
    }
    return serverError("Rejet N1 impossible.", "CLIENT_REJECT_N1_FAILED");
  }
}
