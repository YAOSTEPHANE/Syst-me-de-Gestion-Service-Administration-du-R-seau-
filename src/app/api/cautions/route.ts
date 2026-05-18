import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, conflict, notFound } from "@/lib/api/error-responses";
import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { CAUTION_ENCAISSEMENT_MODES, CAUTION_PAYMENT_MODES } from "@/lib/lonaci/constants";
import {
  CAUTION_LIST_TABS,
  createCaution,
  ensureSprint4Indexes,
  listCautionsForTab,
} from "@/lib/lonaci/sprint4";
import { requireApiAuth } from "@/lib/auth/guards";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  tab: z.enum(CAUTION_LIST_TABS),
});

const createBodySchema = z
  .object({
    contratId: z.string().min(1).optional(),
    lonaciClientId: z.string().min(1).optional(),
    produitCode: z.string().min(1).max(64).optional(),
    montant: z.coerce.number().positive(),
    modeReglement: z.enum(CAUTION_PAYMENT_MODES).optional(),
    dueDate: z.string().datetime(),
    paymentReference: z.string().max(200).optional(),
    observations: z.string().max(2000).nullable().optional(),
    ficheProvisoire: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const c = (data.contratId ?? "").trim();
    const l = (data.lonaciClientId ?? "").trim();
    if (c && l) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Preciser soit contratId soit lonaciClientId, pas les deux.",
        path: ["contratId"],
      });
      return;
    }
    if (!c && !l) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Identifiant client Lonaci (lonaciClientId) requis pour ce parcours.",
        path: ["lonaciClientId"],
      });
      return;
    }
    if (l && !(data.produitCode ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "produitCode requis pour une caution rattachee a un client Lonaci.",
        path: ["produitCode"],
      });
    }
    if (data.ficheProvisoire) return;
    const ref = (data.paymentReference ?? "").trim();
    if (!ref) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reference paiement requise sauf fiche provisoire.",
        path: ["paymentReference"],
      });
    }
    if (!data.modeReglement || data.modeReglement === "PAIEMENT_DIFFERE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mode de reglement requis sauf fiche provisoire.",
        path: ["modeReglement"],
      });
    }
  });

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = listQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return zodBadRequest(parsed.error, "Parametres invalides");
  }

  await ensureSprint4Indexes();
  const { items, total } = await listCautionsForTab(
    parsed.data.tab,
    parsed.data.page,
    parsed.data.pageSize,
  );

  return NextResponse.json({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) return auth.error;

  const parsed = createBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  await ensureSprint4Indexes();
  try {
    const fiche = Boolean(parsed.data.ficheProvisoire);
    const modeReglement = fiche
      ? "PAIEMENT_DIFFERE"
      : (parsed.data.modeReglement as (typeof CAUTION_ENCAISSEMENT_MODES)[number]);
    const paymentReference = fiche ? "" : (parsed.data.paymentReference ?? "").trim();
    const caution = await createCaution({
      contratId: (parsed.data.contratId ?? "").trim() || undefined,
      lonaciClientId: (parsed.data.lonaciClientId ?? "").trim() || undefined,
      produitCode: (parsed.data.produitCode ?? "").trim() || undefined,
      montant: parsed.data.montant,
      modeReglement,
      dueDate: new Date(parsed.data.dueDate),
      paymentReference,
      observations: parsed.data.observations ?? null,
      actor: auth.user,
      ficheProvisoire: fiche,
    });
    return NextResponse.json({ caution }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CONTRAT_NOT_FOUND") {
      return notFound("Contrat introuvable.", "CONTRAT_NOT_FOUND");
    }
    if (code === "CONTRAT_NOT_ACTIF") {
      return conflict("Contrat non actif.", "CONTRAT_NOT_ACTIF");
    }
    if (code === "CONCESSIONNAIRE_NOT_FOUND") {
      return notFound("Concessionnaire introuvable.", "CONCESSIONNAIRE_NOT_FOUND");
    }
    if (code === "CONCESSIONNAIRE_BLOQUE") {
      return conflict(
        "Operation interdite: concessionnaire résilié / inactif / décédé.",
        "CONCESSIONNAIRE_BLOQUE",
      );
    }
    if (code === "CONCESSIONNAIRE_INSCRIPTION_PENDING") {
      return conflict(
        "Inscription non finalisee : validation N1 requise.",
        "CONCESSIONNAIRE_INSCRIPTION_PENDING",
      );
    }
    if (code === "CLIENT_NOT_FOUND") {
      return notFound("Client Lonaci introuvable.", "CLIENT_NOT_FOUND");
    }
    if (code === "CLIENT_INACTIF") {
      return conflict("Client Lonaci inactif.", "CLIENT_INACTIF");
    }
    if (code === "CLIENT_CAUTION_PRODUIT_REQUIS") {
      return conflict("produitCode obligatoire pour cette caution.", "CLIENT_CAUTION_PRODUIT_REQUIS");
    }
    if (code === "PRODUIT_NOT_FOUND") {
      return notFound("Produit referentiel introuvable ou inactif.", "PRODUIT_NOT_FOUND");
    }
    if (code === "PRODUIT_PRIX_CAUTION_INVALIDE") {
      return conflict("Prix caution produit invalide.", "PRODUIT_PRIX_CAUTION_INVALIDE");
    }
    if (code === "CLIENT_CAUTION_MONTANT_INVALIDE") {
      return conflict("Montant incoherent avec le tarif produit.", "CLIENT_CAUTION_MONTANT_INVALIDE");
    }
    if (code === "CAUTION_CREATE_AMBIGUOUS_LINK" || code === "CAUTION_CREATE_NO_LINK") {
      return conflict("Liaison caution invalide.", code);
    }
    if (code.includes("E11000")) {
      return conflict("Une caution existe déjà pour ce contrat.", "DUPLICATE_CAUTION");
    }
    return apiError(500, "Creation caution impossible.", "CAUTION_CREATE_FAILED");
  }
}
