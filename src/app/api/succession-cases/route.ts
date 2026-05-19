import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, badRequest } from "@/lib/api/error-responses";
import { enforceRateLimit, zodBadRequest } from "@/lib/api/endpoint-helpers";
import { SUCCESSION_STATUTS_METIER } from "@/lib/lonaci/succession-statut-metier";
import {
  createSuccessionCase,
  ensureSuccessionIndexes,
  listSuccessionCases,
} from "@/lib/lonaci/succession";
import { requireApiAuth } from "@/lib/auth/guards";
import type { UserDocument } from "@/lib/lonaci/types";
import {
  MAX_SUCCESSION_FILE_BYTES,
  saveSuccessionActeDeces,
  SUCCESSION_ALLOWED_MIME,
} from "@/lib/storage/succession-files";

const createSchema = z.object({
  concessionnaireId: z.string().min(1),
  dateDeces: z.string().datetime().nullable().optional(),
  comment: z.string().max(5000).nullable().optional(),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["OUVERT", "CLOTURE"]).optional(),
  concessionnaireId: z.string().optional(),
  decisionType: z.enum(["TRANSFERT", "RESILIATION"]).optional(),
  statutMetier: z.enum(SUCCESSION_STATUTS_METIER).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

function listScopeAgenceId(user: UserDocument): string | undefined {
  if (user.role === "CHEF_SERVICE" && user.agenceId === null) {
    return undefined;
  }
  if (user.agenceId) {
    return user.agenceId;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, {
    namespace: "succession-cases:list",
    max: 120,
    windowMs: 60 * 1000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  await ensureSuccessionIndexes();
  const scope = listScopeAgenceId(auth.user);
  const result = await listSuccessionCases(
    parsed.data.page,
    parsed.data.pageSize,
    scope,
    parsed.data.status,
    {
      concessionnaireId: parsed.data.concessionnaireId?.trim() || undefined,
      decisionType: parsed.data.decisionType,
      statutMetier: parsed.data.statutMetier,
      dateFrom: parsed.data.dateFrom ? new Date(parsed.data.dateFrom) : undefined,
      dateTo: parsed.data.dateTo ? new Date(parsed.data.dateTo) : undefined,
    },
  );
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, {
    namespace: "succession-cases:create",
    max: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return badRequest("Donnees invalides", "INVALID_BODY");
  }
  const parsed = createSchema.safeParse({
    concessionnaireId: form.get("concessionnaireId"),
    dateDeces: (() => {
      const v = form.get("dateDeces");
      return typeof v === "string" && v.trim().length > 0 ? v : null;
    })(),
    comment: form.get("comment"),
  });
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }
  const acte = form.get("acteDeces");
  if (!(acte instanceof File)) {
    return badRequest("ACTE_DECES_REQUIRED", "ACTE_DECES_REQUIRED");
  }
  if (acte.size > MAX_SUCCESSION_FILE_BYTES) {
    return badRequest(
      `Fichier trop volumineux (max ${MAX_SUCCESSION_FILE_BYTES} octets)`,
      "FILE_TOO_LARGE",
    );
  }
  const mimeType = acte.type || "application/octet-stream";
  if (!SUCCESSION_ALLOWED_MIME[mimeType]) {
    return badRequest("Type MIME non autorise", "INVALID_MIME_TYPE");
  }
  const rawFilename = acte.name || "acte-deces";
  const bytes = Buffer.from(await acte.arrayBuffer());
  const storageCaseId = `declaration-${parsed.data.concessionnaireId}-${Date.now()}`;
  const storedRelativePath = await saveSuccessionActeDeces(storageCaseId, rawFilename, bytes);

  await ensureSuccessionIndexes();
  try {
    const doc = await createSuccessionCase({
      concessionnaireId: parsed.data.concessionnaireId,
      dateDeces: parsed.data.dateDeces ? new Date(parsed.data.dateDeces) : null,
      comment: parsed.data.comment ?? null,
      acteDeces: {
        filename: rawFilename,
        mimeType,
        size: bytes.length,
        storedRelativePath,
      },
      actor: auth.user,
    });
    return NextResponse.json(
      {
        case: {
          id: doc._id,
          reference: doc.reference,
          concessionnaireId: doc.concessionnaireId,
          status: doc.status,
          stepHistory: doc.stepHistory.map((s) => ({
            ...s,
            completedAt: s.completedAt.toISOString(),
          })),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const map: Record<string, number> = {
      CONCESSIONNAIRE_NOT_FOUND: 404,
      AGENCE_FORBIDDEN: 403,
      ALREADY_DECEDE: 409,
      CONCESSIONNAIRE_RESILIE: 409,
      SUCCESSION_ALREADY_OPEN: 409,
      ACTE_DECES_REQUIRED: 400,
    };
    const status = map[code] ?? 500;
    return apiError(status, code === "UNKNOWN" ? "Creation impossible" : code, code);
  }
}
