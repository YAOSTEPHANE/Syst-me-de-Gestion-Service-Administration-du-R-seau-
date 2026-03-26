import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
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
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
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
      dateFrom:
        parsed.data.dateFrom && !Number.isNaN(new Date(parsed.data.dateFrom).getTime())
          ? new Date(parsed.data.dateFrom)
          : undefined,
      dateTo:
        parsed.data.dateTo && !Number.isNaN(new Date(parsed.data.dateTo).getTime())
          ? new Date(parsed.data.dateTo)
          : undefined,
    },
  );
  return NextResponse.json(result, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ message: "Donnees invalides" }, { status: 400 });
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
    return NextResponse.json({ message: "Donnees invalides", issues: parsed.error.issues }, { status: 400 });
  }
  const acte = form.get("acteDeces");
  if (!(acte instanceof File)) {
    return NextResponse.json({ message: "ACTE_DECES_REQUIRED" }, { status: 400 });
  }
  if (acte.size > MAX_SUCCESSION_FILE_BYTES) {
    return NextResponse.json(
      { message: `Fichier trop volumineux (max ${MAX_SUCCESSION_FILE_BYTES} octets)` },
      { status: 400 },
    );
  }
  const mimeType = acte.type || "application/octet-stream";
  if (!SUCCESSION_ALLOWED_MIME[mimeType]) {
    return NextResponse.json({ message: "Type MIME non autorise" }, { status: 400 });
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
    return NextResponse.json(
      { message: code === "UNKNOWN" ? "Creation impossible" : code },
      { status },
    );
  }
}
