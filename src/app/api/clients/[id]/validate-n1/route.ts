import { NextRequest, NextResponse } from "next/server";

import { notFound, serverError } from "@/lib/api/error-responses";
import { canReadClientDirectory } from "@/lib/lonaci/access";
import { findClientById, sanitizeClientPublic, validateClientCreationN1 } from "@/lib/lonaci/clients";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION"],
    rbac: { resource: "CLIENTS", action: "VALIDATE_N1" },
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const existing = await findClientById(id);
  if (!existing || existing.deletedAt) {
    return notFound("Client introuvable.", "CLIENT_NOT_FOUND");
  }
  if (!(await canReadClientDirectory(auth.user, existing))) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  try {
    const row = await validateClientCreationN1(id, auth.user);
    return NextResponse.json({ ok: true, client: sanitizeClientPublic(row) }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CLIENT_NOT_FOUND") return notFound("Client introuvable.", "CLIENT_NOT_FOUND");
    if (code === "ROLE_FORBIDDEN" || code === "CLIENT_WRONG_STATUS") {
      return NextResponse.json({ message: "Transition non autorisee.", code }, { status: 403 });
    }
    return serverError("Validation N1 impossible.", "CLIENT_VALIDATE_N1_FAILED");
  }
}
