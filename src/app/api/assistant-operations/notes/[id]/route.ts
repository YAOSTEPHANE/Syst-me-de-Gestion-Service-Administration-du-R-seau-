import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { LONACI_ROLES } from "@/lib/lonaci/constants";
import { deleteAssistantNote, getAssistantNoteById } from "@/lib/lonaci/assistant-operations";

const NOTE_ADMIN_ROLES = new Set(["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE", "SUPERVISEUR_REGIONAL", "AUDITEUR"]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: [...LONACI_ROLES] });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const note = await getAssistantNoteById(id);
  if (!note) return NextResponse.json({ message: "Non trouve" }, { status: 404 });

  const actorUserId = auth.user._id ?? "";
  const canDelete = NOTE_ADMIN_ROLES.has(auth.user.role) || note.createdByUserId === actorUserId;
  if (!canDelete) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  const deleted = await deleteAssistantNote(id);
  if (!deleted) return NextResponse.json({ message: "Non trouve" }, { status: 404 });

  return NextResponse.json({ ok: true }, { status: 200 });
}
