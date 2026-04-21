import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { requireApiAuth } from "@/lib/auth/guards";
import { clearCurrentSessions, setUsersActiveState } from "@/lib/lonaci/users";

const bulkSchema = z.object({
  action: z.enum(["FORCE_LOGOUT", "ACTIVATE", "DEACTIVATE"]),
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const parsed = bulkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const actorId = auth.user._id ?? "";
  const ids = [...new Set(parsed.data.ids.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) {
    return NextResponse.json({ message: "Aucun utilisateur cible." }, { status: 400 });
  }

  if ((parsed.data.action === "FORCE_LOGOUT" || parsed.data.action === "DEACTIVATE") && actorId && ids.includes(actorId)) {
    return NextResponse.json(
      { message: "Action refusée sur votre propre compte. Utilisez la déconnexion standard." },
      { status: 400 },
    );
  }

  if (parsed.data.action === "FORCE_LOGOUT") {
    const updated = await clearCurrentSessions(ids);
    return NextResponse.json({ ok: true, updated, message: `${updated} session(s) invalidée(s).` }, { status: 200 });
  }
  if (parsed.data.action === "ACTIVATE") {
    const updated = await setUsersActiveState(ids, true);
    return NextResponse.json({ ok: true, updated, message: `${updated} compte(s) activé(s).` }, { status: 200 });
  }

  const updated = await setUsersActiveState(ids, false);
  return NextResponse.json({ ok: true, updated, message: `${updated} compte(s) désactivé(s).` }, { status: 200 });
}
