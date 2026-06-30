import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireListAgenceScope } from "@/lib/api/list-agence-scope";
import { requireApiAuth } from "@/lib/auth/guards";
import { getAgenceSlaSnapshot } from "@/lib/lonaci/dashboard-stats";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  agenceId: z.string().optional(),
  status: z.enum(["ALL", "OVERDUE"]).default("ALL"),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const agenceScope = requireListAgenceScope(auth.user, parsed.data.agenceId);
  if (!agenceScope.ok) return agenceScope.response;

  const all = await getAgenceSlaSnapshot(agenceScope.agenceId);
  const allowedAgenceIds =
    agenceScope.agenceIds && agenceScope.agenceIds.length > 0
      ? new Set(agenceScope.agenceIds)
      : null;
  const scoped = allowedAgenceIds
    ? all.filter((row) => row.agenceId && allowedAgenceIds.has(row.agenceId))
    : all;
  const filtered = parsed.data.status === "OVERDUE" ? scoped.filter((row) => row.overdueTotal > 0) : scoped;
  const total = filtered.length;
  const page = parsed.data.page;
  const pageSize = parsed.data.pageSize;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return NextResponse.json(
    {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    },
    { status: 200 },
  );
}
