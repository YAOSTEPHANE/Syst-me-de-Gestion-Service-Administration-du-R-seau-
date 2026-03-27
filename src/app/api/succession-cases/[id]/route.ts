import { NextRequest, NextResponse } from "next/server";

import { canReadConcessionnaire } from "@/lib/lonaci/access";
import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import { ensureSuccessionIndexes, findSuccessionCaseById } from "@/lib/lonaci/succession";
import { findUserById } from "@/lib/lonaci/users";
import { requireApiAuth } from "@/lib/auth/guards";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  await ensureSuccessionIndexes();
  const doc = await findSuccessionCaseById(id);
  if (!doc) {
    return NextResponse.json({ message: "CASE_NOT_FOUND" }, { status: 404 });
  }

  const conc = await findConcessionnaireById(doc.concessionnaireId);
  if (!conc || conc.deletedAt) {
    return NextResponse.json({ message: "CONCESSIONNAIRE_NOT_FOUND" }, { status: 404 });
  }
  if (!canReadConcessionnaire(auth.user, conc)) {
    return NextResponse.json({ message: "AGENCE_FORBIDDEN" }, { status: 403 });
  }

  const stepHistory = Array.isArray(doc.stepHistory) ? doc.stepHistory : [];
  const documents = Array.isArray(doc.documents) ? doc.documents : [];

  const allUserIds = new Set<string>();
  for (const step of stepHistory) {
    if (step.completedByUserId) allUserIds.add(step.completedByUserId);
  }
  for (const file of documents) {
    if (file.uploadedByUserId) allUserIds.add(file.uploadedByUserId);
  }
  if (doc.acteDeces?.uploadedByUserId) allUserIds.add(doc.acteDeces.uploadedByUserId);
  if (doc.decision?.decidedByUserId) allUserIds.add(doc.decision.decidedByUserId);

  const users = await Promise.all([...allUserIds].map(async (userId) => [userId, await findUserById(userId)] as const));
  const userMap = new Map(users.map(([id2, u]) => [id2, u]));

  return NextResponse.json(
    {
      case: {
        id: doc._id,
        reference: doc.reference,
        status: doc.status,
        concessionnaire: {
          id: conc._id,
          codePdv: conc.codePdv,
          nomComplet: conc.nomComplet,
          raisonSociale: conc.raisonSociale,
          statut: conc.statut,
        },
        dateDeces: doc.dateDeces ? doc.dateDeces.toISOString() : null,
        acteDeces: doc.acteDeces
          ? {
              ...doc.acteDeces,
              uploadedAt: doc.acteDeces.uploadedAt.toISOString(),
              uploadedByUser: userMap.get(doc.acteDeces.uploadedByUserId)
                ? {
                    id: userMap.get(doc.acteDeces.uploadedByUserId)?._id ?? "",
                    nom: userMap.get(doc.acteDeces.uploadedByUserId)?.nom ?? "",
                    prenom: userMap.get(doc.acteDeces.uploadedByUserId)?.prenom ?? "",
                    role: userMap.get(doc.acteDeces.uploadedByUserId)?.role ?? "",
                  }
                : null,
            }
          : null,
        ayantDroit: {
          nom: doc.ayantDroitNom,
          lienParente: doc.ayantDroitLienParente,
          telephone: doc.ayantDroitTelephone,
          email: doc.ayantDroitEmail,
        },
        documents: documents.map((d) => ({
          ...d,
          uploadedAt: d.uploadedAt ? d.uploadedAt.toISOString() : "",
          uploadedByUser: userMap.get(d.uploadedByUserId)
            ? {
                id: userMap.get(d.uploadedByUserId)?._id ?? "",
                nom: userMap.get(d.uploadedByUserId)?.nom ?? "",
                prenom: userMap.get(d.uploadedByUserId)?.prenom ?? "",
                role: userMap.get(d.uploadedByUserId)?.role ?? "",
              }
            : null,
        })),
        stepHistory: stepHistory.map((s) => ({
          ...s,
          completedAt: s.completedAt ? s.completedAt.toISOString() : "",
          completedByUser: userMap.get(s.completedByUserId)
            ? {
                id: userMap.get(s.completedByUserId)?._id ?? "",
                nom: userMap.get(s.completedByUserId)?.nom ?? "",
                prenom: userMap.get(s.completedByUserId)?.prenom ?? "",
                role: userMap.get(s.completedByUserId)?.role ?? "",
              }
            : null,
        })),
        decision: doc.decision
          ? {
              ...doc.decision,
              decidedAt: doc.decision.decidedAt.toISOString(),
              decidedByUser: userMap.get(doc.decision.decidedByUserId)
                ? {
                    id: userMap.get(doc.decision.decidedByUserId)?._id ?? "",
                    nom: userMap.get(doc.decision.decidedByUserId)?.nom ?? "",
                    prenom: userMap.get(doc.decision.decidedByUserId)?.prenom ?? "",
                    role: userMap.get(doc.decision.decidedByUserId)?.role ?? "",
                  }
                : null,
            }
          : null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
