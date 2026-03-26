import { NextRequest, NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/guards";
import { clearCurrentSession, findUserById } from "@/lib/lonaci/users";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, { roles: ["CHEF_SERVICE"] });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const target = await findUserById(id);
  if (!target) {
    return NextResponse.json({ message: "Compte introuvable" }, { status: 404 });
  }

  if ((auth.user._id ?? "") === (target._id ?? "")) {
    return NextResponse.json(
      { message: "Utilisez /api/auth/logout pour fermer votre propre session." },
      { status: 400 },
    );
  }

  await clearCurrentSession(target._id ?? "");

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: target._id ?? "",
        email: target.email,
      },
      message: "Session utilisateur invalidee. La prochaine requete exigera une reconnexion.",
    },
    { status: 200 },
  );
}

