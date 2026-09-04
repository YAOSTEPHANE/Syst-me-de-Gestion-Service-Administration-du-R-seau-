import { NextRequest, NextResponse } from "next/server";

/** Compat : ancienne URL → demande de faire-part. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const target = new URL(
    `/api/succession-cases/${encodeURIComponent(id)}/faire-part/demande/pdf`,
    request.nextUrl.origin,
  );
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target, 307);
}
