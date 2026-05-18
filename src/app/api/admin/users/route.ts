import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { conflict } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
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
  role: z.enum(LONACI_ROLES).optional(),
  agenceId: z.string().trim().optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  await ensureUsersIndexes();
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }
  const users = await listUsers();
  const statusFiltered =
    parsed.data.status === "ALL"
      ? users
      : users.filter((u) => (parsed.data.status === "ACTIF" ? u.actif : !u.actif));

  const roleFiltered = parsed.data.role ? statusFiltered.filter((u) => u.role === parsed.data.role) : statusFiltered;
  const agenceFiltered = parsed.data.agenceId
    ? roleFiltered.filter((u) => (u.agenceId ?? "").trim() === parsed.data.agenceId)
    : roleFiltered;

  const q = parsed.data.q?.trim().toLowerCase();
  const searched = q
    ? agenceFiltered.filter((u) => {
        const haystack = [u.email, u.nom, u.prenom, u.matricule ?? "", u.role].join(" ").toLowerCase();
        return haystack.includes(q);
      })
    : agenceFiltered;

  const total = searched.length;
  const totalPages = Math.max(1, Math.ceil(total / parsed.data.pageSize));
  const page = Math.min(parsed.data.page, totalPages);
  const start = (page - 1) * parsed.data.pageSize;
  const pageItems = searched.slice(start, start + parsed.data.pageSize);

  return NextResponse.json(
    {
      users: pageItems.map(sanitizeUser),
      pagination: {
        page,
        pageSize: parsed.data.pageSize,
        total,
        totalPages,
      },
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  await ensureUsersIndexes();

  const existing = await findUserByEmail(parsed.data.email);
  if (existing) {
    return conflict("Un compte existe deja avec cet email", "DUPLICATE_EMAIL");
  }
  if (parsed.data.matricule) {
    const existingMatricule = await findUserByMatricule(parsed.data.matricule);
    if (existingMatricule) {
      return conflict("Un compte existe deja avec ce matricule", "DUPLICATE_MATRICULE");
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
