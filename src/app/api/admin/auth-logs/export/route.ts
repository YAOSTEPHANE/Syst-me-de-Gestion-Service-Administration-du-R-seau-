import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { ensureAuthLogsIndexes, listAuthLogs } from "@/lib/lonaci/auth-logs";
import { createPdfResponse, renderAdminAuthLogsExportPdf } from "@/lib/pdf";

const querySchema = z.object({
  email: z.string().email().optional(),
  status: z.enum(["SUCCESS", "FAILED"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureAuthLogsIndexes();
  const result = await listAuthLogs({
    page: 1,
    pageSize: 5000,
    email: parsed.data.email,
    status: parsed.data.status,
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
  });
  const generatedAt = new Date();
  const pdfBuffer = await renderAdminAuthLogsExportPdf(
    result.logs.map((row) => ({
      attemptedAt: new Date(row.attemptedAt),
      status: row.status,
      email: row.email,
      ipAddress: row.ipAddress ?? "-",
      reason: row.reason ?? "-",
    })),
    {
      email: parsed.data.email ?? "ALL",
      status: parsed.data.status ?? "ALL",
      from: parsed.data.from ?? "-",
      to: parsed.data.to ?? "-",
    },
    generatedAt,
  );

  return createPdfResponse(pdfBuffer, {
    filename: `auth-logs-${generatedAt.getTime()}.pdf`,
  });
}
