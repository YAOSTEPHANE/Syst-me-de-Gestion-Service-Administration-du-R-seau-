import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { getDatabase } from "@/lib/mongodb";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) return auth.error;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  const db = await getDatabase();
  const skip = (parsed.data.page - 1) * parsed.data.pageSize;
  const filter = { kind: "supervision_export_daily" };
  const [total, rows] = await Promise.all([
    db.collection("report_cron_runs").countDocuments(filter),
    db
      .collection("report_cron_runs")
      .find(filter, {
        projection: {
          _id: 1,
          createdAt: 1,
          status: 1,
          summary: 1,
          "artifact.filename": 1,
          "artifact.contentType": 1,
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsed.data.pageSize)
      .toArray(),
  ]);

  const items = rows.map((row) => {
    const artifact = (row as { artifact?: { filename?: string; contentType?: string } }).artifact;
    return {
      id: String(row._id),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
      status: typeof row.status === "string" ? row.status : "UNKNOWN",
      summary:
        typeof row.summary === "object" && row.summary !== null
          ? (row.summary as Record<string, unknown>)
          : null,
      artifact: artifact?.filename
        ? {
            filename: artifact.filename,
            contentType: artifact.contentType ?? "application/octet-stream",
          }
        : null,
    };
  });

  return NextResponse.json(
    {
      items,
      pagination: {
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / parsed.data.pageSize)),
      },
    },
    { status: 200 },
  );
}
