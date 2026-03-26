import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { LONACI_ROLES } from "@/lib/lonaci/constants";
import { requireApiAuth } from "@/lib/auth/guards";
import { findUserByEmail, findUserById, findUserByMatricule, sanitizeUser, updateUserAdmin } from "@/lib/lonaci/users";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  email: z.string().email().optional(),
  matricule: z.string().min(2).max(50).nullable().optional(),
  nom: z.string().min(2).optional(),
  prenom: z.string().min(2).optional(),
  role: z.enum(LONACI_ROLES).optional(),
  agenceId: z.string().min(1).nullable().optional(),
  agencesAutorisees: z.array(z.string().min(1)).optional(),
  modulesAutorises: z.array(z.string().min(1)).optional(),
  produitsAutorises: z.array(z.string().min(1)).optional(),
  actif: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const current = await findUserById(id);
  if (!current) {
    return NextResponse.json({ message: "Compte introuvable" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.email && parsed.data.email.trim().toLowerCase() !== current.email) {
    const existingEmail = await findUserByEmail(parsed.data.email);
    if (existingEmail) {
      return NextResponse.json({ message: "Un compte existe deja avec cet email" }, { status: 409 });
    }
  }
  if (
    parsed.data.matricule &&
    parsed.data.matricule.trim().toUpperCase() !== (current.matricule ?? "").toUpperCase()
  ) {
    const existingMatricule = await findUserByMatricule(parsed.data.matricule);
    if (existingMatricule) {
      return NextResponse.json({ message: "Un compte existe deja avec ce matricule" }, { status: 409 });
    }
  }

  const updated = await updateUserAdmin(id, {
    ...parsed.data,
    matricule: parsed.data.matricule === null ? null : parsed.data.matricule,
  });
  if (!updated) {
    return NextResponse.json({ message: "Compte introuvable" }, { status: 404 });
  }

  return NextResponse.json({ user: sanitizeUser(updated) }, { status: 200 });
}
