import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import {
  createGprRegistration,
  ensureGprGrattageIndexes,
  GPR_REGISTRATION_STATUSES,
  listGprRegistrations,
} from "@/lib/lonaci/gpr-grattage";
import { GPR_ADMIN_ROLES } from "@/lib/lonaci/grattage-access";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(GPR_REGISTRATION_STATUSES).optional(),
});

const createSchema = z
  .object({
    concessionnaireId: z.string().min(1).optional(),
    lonaciClientId: z.string().min(1).optional(),
    produitsActifs: z.array(z.string().min(1)).min(1),
    dateEnregistrement: z.string().datetime(),
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
  const auth = await requireApiAuth(request, { roles: [...GPR_ADMIN_ROLES] });
  if ("error" in auth) return auth.error;
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }
  await ensureGprGrattageIndexes();
  const data = await listGprRegistrations(parsed.data);
  return NextResponse.json(data, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...GPR_ADMIN_ROLES] });
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
  const created = await createGprRegistration({
    concessionnaireId,
    produitsActifs: parsed.data.produitsActifs.map((p) => p.trim().toUpperCase()),
    dateEnregistrement: new Date(parsed.data.dateEnregistrement),
    actor: auth.user,
  });
  return NextResponse.json({ registration: created }, { status: 201 });
}
