import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { canMutateClientCore, canReadClientDirectory } from "@/lib/lonaci/access";
import { CLIENT_STATUTS } from "@/lib/lonaci/client-constants";
import {
  findClientById,
  sanitizeClientPublic,
  softDeleteClient,
  updateClient,
} from "@/lib/lonaci/clients";
import { requireApiAuth } from "@/lib/auth/guards";

const patchSchema = z
  .object({
    nomComplet: z.string().min(2).max(200).optional(),
    raisonSociale: z.string().min(2).max(300).optional(),
    cniNumero: z.preprocess(
      (v) => {
        if (v === undefined) return undefined;
        if (v === null || v === "") return null;
        if (typeof v !== "string") return null;
        const t = v.trim();
        return t === "" ? null : t;
      },
      z.union([z.string().min(4).max(64), z.null()]).optional(),
    ),
    nomContact: z.union([z.string().min(2).max(200), z.null()]).optional(),
    email: z.union([z.string().email(), z.null()]).optional(),
    telephone: z.union([z.string().min(6).max(32), z.null()]).optional(),
    adresse: z.union([z.string().max(500), z.null()]).optional(),
    ville: z.union([z.string().max(120), z.null()]).optional(),
    codePostal: z.union([z.string().max(12), z.null()]).optional(),
    agenceId: z.union([z.string().min(1), z.null()]).optional(),
    statut: z.enum(CLIENT_STATUTS).optional(),
    notes: z.union([z.string().max(10000), z.null()]).optional(),
  })
  .strip();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const doc = await findClientById(id);
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!(await canReadClientDirectory(auth.user, doc))) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  return NextResponse.json({ client: sanitizeClientPublic(doc) }, { status: 200 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const rawBody = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const existing = await findClientById(id);
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!(await canReadClientDirectory(auth.user, existing))) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  if (!(await canMutateClientCore(auth.user, existing))) {
    return NextResponse.json({ message: "Modification interdite" }, { status: 403 });
  }

  if (parsed.data.agenceId !== undefined && parsed.data.agenceId !== existing.agenceId) {
    if (auth.user.role !== "CHEF_SERVICE") {
      return NextResponse.json(
        { message: "Changement d'agence réservé au rôle Chef(fe) de service" },
        { status: 403 },
      );
    }
  }

  const updated = await updateClient(id, parsed.data, auth.user);
  if (!updated) {
    return NextResponse.json({ message: "Mise a jour impossible" }, { status: 500 });
  }

  return NextResponse.json({ client: sanitizeClientPublic(updated) });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const existing = await findClientById(id);
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!(await canReadClientDirectory(auth.user, existing))) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  const ok = await softDeleteClient(id, auth.user);
  if (!ok) {
    return NextResponse.json({ message: "Desactivation impossible" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
