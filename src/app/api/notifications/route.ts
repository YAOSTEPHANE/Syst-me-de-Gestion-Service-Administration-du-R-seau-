import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureNotificationIndexes, listMyNotifications } from "@/lib/lonaci/notifications";
import { requireApiAuth } from "@/lib/auth/guards";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if ("error" in auth) {
    return auth.error;
  }
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }
  await ensureNotificationIndexes();
  const result = await listMyNotifications(auth.user._id ?? "", parsed.data.page, parsed.data.pageSize);
  return NextResponse.json(result, { status: 200 });
}
