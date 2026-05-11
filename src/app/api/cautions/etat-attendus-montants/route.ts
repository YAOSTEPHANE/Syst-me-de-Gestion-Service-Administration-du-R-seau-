import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import type { LonaciRole } from "@/lib/lonaci/constants";
import {
  deleteCautionEtatAttendusSaisi,
  ensureSprint4Indexes,
  upsertCautionEtatAttendusSaisi,
} from "@/lib/lonaci/sprint4";

const postSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  produitCode: z.string().min(1).max(64),
  montantAttendusCautions: z.coerce.number().int().min(0).max(999_999_999_999),
});

const deleteQuerySchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  produitCode: z.string().min(1).max(64),
});

/** Saisie des attendus mensuels : sous /api/cautions (module CAUTIONS), pas /api/admin (module ADMIN). */
const attendusSaisieAuth = {
  roles: ["CHEF_SERVICE", "ASSIST_CDS"] satisfies LonaciRole[],
  rbac: { resource: "CAUTIONS" as const, action: "CREATE" as const },
};

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, attendusSaisieAuth);
  if ("error" in auth) return auth.error;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const userId = auth.user._id?.trim();
  if (!userId) {
    return NextResponse.json({ message: "Utilisateur sans identifiant" }, { status: 400 });
  }

  await ensureSprint4Indexes();
  await upsertCautionEtatAttendusSaisi({
    yearMonth: parsed.data.yearMonth,
    produitCode: parsed.data.produitCode,
    montantAttendusCautions: parsed.data.montantAttendusCautions,
    updatedByUserId: userId,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiAuth(request, attendusSaisieAuth);
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = deleteQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  await ensureSprint4Indexes();
  const deleted = await deleteCautionEtatAttendusSaisi(parsed.data.yearMonth, parsed.data.produitCode);

  return NextResponse.json({ ok: true, deleted }, { status: 200 });
}
