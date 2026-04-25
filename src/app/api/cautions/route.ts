import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, conflict, notFound } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { CAUTION_PAYMENT_MODES } from "@/lib/lonaci/constants";
import {
  CAUTION_LIST_TABS,
  createCaution,
  ensureSprint4Indexes,
  listCautionsForTab,
} from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  tab: z.enum(CAUTION_LIST_TABS),
});

const schema = z.object({
  contratId: z.string().min(1),
  montant: z.coerce.number().positive(),
  modeReglement: z.enum(CAUTION_PAYMENT_MODES),
  dueDate: z.string().datetime(),
  paymentReference: z.string().min(1).max(200),
  observations: z.string().max(2000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  await ensureSprint4Indexes();
  const { items, total } = await listCautionsForTab(
    parsed.data.tab,
    parsed.data.page,
    parsed.data.pageSize,
  );

  return NextResponse.json({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  await ensureSprint4Indexes();
  try {
    const caution = await createCaution({
      contratId: parsed.data.contratId,
      montant: parsed.data.montant,
      modeReglement: parsed.data.modeReglement,
      dueDate: new Date(parsed.data.dueDate),
      paymentReference: parsed.data.paymentReference.trim(),
      observations: parsed.data.observations ?? null,
      actor: auth.user,
    });
    return NextResponse.json({ caution }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CONTRAT_NOT_FOUND") {
      return notFound("Contrat introuvable.", "CONTRAT_NOT_FOUND");
    }
    if (code === "CONTRAT_NOT_ACTIF") {
      return conflict("Contrat non actif.", "CONTRAT_NOT_ACTIF");
    }
    if (code === "CONCESSIONNAIRE_NOT_FOUND") {
      return notFound("Concessionnaire introuvable.", "CONCESSIONNAIRE_NOT_FOUND");
    }
    if (code === "CONCESSIONNAIRE_BLOQUE") {
      return conflict(
        "Operation interdite: concessionnaire résilié / inactif / décédé.",
        "CONCESSIONNAIRE_BLOQUE",
      );
    }
    if (code.includes("E11000")) {
      return conflict("Une caution existe déjà pour ce contrat.", "DUPLICATE_CAUTION");
    }
    return apiError(500, "Creation caution impossible.", "CAUTION_CREATE_FAILED");
  }
}
