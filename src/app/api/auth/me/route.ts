import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { sanitizeUser } from "@/lib/lonaci/users";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  return NextResponse.json({ user: sanitizeUser(auth.user) }, { status: 200 });
}
