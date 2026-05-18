import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import {
  ensureAssistantOperationsIndexes,
  getAssistantChecklist,
  listAssistantNotes,
} from "@/lib/lonaci/assistant-operations";

const CHECKLIST_EDITOR_ROLES = new Set(["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "SUPERVISEUR_REGIONAL"]);
const NOTE_ADMIN_ROLES = new Set(["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "SUPERVISEUR_REGIONAL", "AUDITEUR"]);

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, { roles: [...LONACI_ROLES] });
  if ("error" in auth) return auth.error;

  await ensureAssistantOperationsIndexes();
  const [checklist, notes] = await Promise.all([getAssistantChecklist(), listAssistantNotes(80)]);

  return NextResponse.json(
    {
      checklist,
      notes,
      currentUserId: auth.user._id ?? "",
      permissions: {
        canEditChecklist: CHECKLIST_EDITOR_ROLES.has(auth.user.role),
        canDeleteAnyNote: NOTE_ADMIN_ROLES.has(auth.user.role),
      },
    },
    { status: 200 },
  );
}
