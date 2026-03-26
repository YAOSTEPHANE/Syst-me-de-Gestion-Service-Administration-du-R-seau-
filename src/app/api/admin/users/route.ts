import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/auth/password";
import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import {
  createUser,
  ensureUsersIndexes,
  findUserByEmail,
  findUserByMatricule,
  listUsers,
  sanitizeUser,
} from "@/lib/lonaci/users";

const createUserSchema = z.object({
  email: z.string().email(),
  matricule: z.string().min(2).max(50).optional(),
  password: z.string().min(8),
  nom: z.string().min(2),
  prenom: z.string().min(2),
  role: z.enum(LONACI_ROLES),
  agenceId: z.string().min(1).nullable().optional(),
  agencesAutorisees: z.array(z.string().min(1)).optional(),
  modulesAutorises: z.array(z.string().min(1)).optional(),
  produitsAutorises: z.array(z.string().min(1)).optional(),
});

const listSchema = z.object({
  status: z.enum(["ALL", "ACTIF", "INACTIF"]).optional().default("ALL"),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  await ensureUsersIndexes();
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides" }, { status: 400 });
  }
  const users = await listUsers();
  const filtered =
    parsed.data.status === "ALL"
      ? users
      : users.filter((u) => (parsed.data.status === "ACTIF" ? u.actif : !u.actif));
  return NextResponse.json({ users: filtered.map(sanitizeUser) }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Donnees invalides",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  await ensureUsersIndexes();

  const existing = await findUserByEmail(parsed.data.email);
  if (existing) {
    return NextResponse.json({ message: "Un compte existe deja avec cet email" }, { status: 409 });
  }
  if (parsed.data.matricule) {
    const existingMatricule = await findUserByMatricule(parsed.data.matricule);
    if (existingMatricule) {
      return NextResponse.json({ message: "Un compte existe deja avec ce matricule" }, { status: 409 });
    }
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await createUser({
    email: parsed.data.email,
    matricule: parsed.data.matricule ?? null,
    passwordHash,
    nom: parsed.data.nom,
    prenom: parsed.data.prenom,
    role: parsed.data.role,
    agenceId: parsed.data.agenceId ?? null,
    agencesAutorisees: parsed.data.agencesAutorisees ?? [],
    modulesAutorises: parsed.data.modulesAutorises ?? [],
    produitsAutorises: parsed.data.produitsAutorises ?? [],
  });

  return NextResponse.json({ user: sanitizeUser(user) }, { status: 201 });
}
