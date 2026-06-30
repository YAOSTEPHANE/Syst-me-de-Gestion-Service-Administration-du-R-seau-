import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  createScratchLot,
  ensureGprGrattageIndexes,
  listScratchLots,
  SCRATCH_CODE_STATUSES,
} from "@/lib/lonaci/gpr-grattage";
import { GRATTAGE_API_ROLES } from "@/lib/lonaci/grattage-access";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  concessionnaireId: z.string().optional(),
  produitCode: z.string().optional(),
  status: z.enum(SCRATCH_CODE_STATUSES).optional(),
});

const createSchema = z
  .object({
    lotId: z.string().trim().min(2).max(64).optional(),
    nombreCodes: z.number().int().min(1).max(5000),
    concessionnaireId: z.string().min(1).optional(),
    lonaciClientId: z.string().min(1).optional(),
    produitCode: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (!(data.lonaciClientId ?? "").trim() && !(data.concessionnaireId ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Client Lonaci requis.",
        path: ["lonaciClientId"],
      });
    }
  });

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...GRATTAGE_API_ROLES] });
  if ("error" in auth) return auth.error;
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }
  await ensureGprGrattageIndexes();
  const data = await listScratchLots({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    concessionnaireId: parsed.data.concessionnaireId,
    produitCode: parsed.data.produitCode,
    status: parsed.data.status,
  });
  return NextResponse.json(data, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }
  await ensureGprGrattageIndexes();
  const { resolveFormPartyIds } = await import("@/lib/lonaci/client-party-resolve");
  let concessionnaireId: string;
  try {
    const party = await resolveFormPartyIds({
      lonaciClientId: (parsed.data.lonaciClientId ?? "").trim() || null,
      concessionnaireId: (parsed.data.concessionnaireId ?? "").trim() || null,
      requirePdv: true,
    });
    if (!party.concessionnaireId) {
      return badRequest("Client sans point de vente associé.", "CLIENT_NOT_PROMOTED");
    }
    concessionnaireId = party.concessionnaireId;
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CLIENT_NOT_FOUND") {
      return badRequest("Client introuvable.", "CLIENT_NOT_FOUND");
    }
    return badRequest("Sélectionnez un client lié à un point de vente.", "CLIENT_NOT_PROMOTED");
  }
  const created = await createScratchLot({
    lotId: parsed.data.lotId?.trim().toUpperCase(),
    nombreCodes: parsed.data.nombreCodes,
    concessionnaireId,
    produitCode: parsed.data.produitCode.trim().toUpperCase(),
    actor: auth.user,
  });
  return NextResponse.json({ ok: true, lotId: created.lotId, generatedCount: created.generatedCount }, { status: 201 });
}
