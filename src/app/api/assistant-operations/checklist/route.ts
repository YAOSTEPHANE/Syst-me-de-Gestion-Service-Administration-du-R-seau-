import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import { saveAssistantChecklist } from "@/lib/lonaci/assistant-operations";

const CHECKLIST_EDITOR_ROLES = new Set(["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "SUPERVISEUR_REGIONAL"]);

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        label: z.string().min(1).max(220),
        checked: z.boolean(),
      }),
    )
    .min(1)
    .max(30),
});

export async function PUT(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...LONACI_ROLES] });
  if ("error" in auth) return auth.error;
  if (!CHECKLIST_EDITOR_ROLES.has(auth.user.role)) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametres invalides", issues: parsed.error.issues }, { status: 400 });
  }

  await saveAssistantChecklist({
    items: parsed.data.items,
    actorUserId: auth.user._id ?? "",
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
