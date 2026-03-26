import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import {
  createAgence,
  ensureReferentialsIndexes,
  listAgences,
} from "@/lib/lonaci/referentials";

const createAgenceSchema = z.object({
  code: z.string().min(2).max(32),
  libelle: z.string().min(2).max(200),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  await ensureReferentialsIndexes();
  const agences = await listAgences();
  return NextResponse.json({ agences }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const parsed = createAgenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureReferentialsIndexes();
  try {
    const agence = await createAgence(parsed.data);
    return NextResponse.json({ agence }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de creer l'agence";
    const dup =
      message.includes("E11000") ||
      message.includes("duplicate key") ||
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: number }).code === 11000);
    if (dup) {
      return NextResponse.json({ message: "Le code agence existe deja" }, { status: 409 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}
