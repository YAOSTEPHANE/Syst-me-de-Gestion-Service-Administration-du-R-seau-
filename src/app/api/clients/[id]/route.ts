import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { zodBadRequest } from "@/lib/api/endpoint-helpers";
import { badRequest } from "@/lib/api/error-responses";
import { canMutateClientCore, canReadClientDirectory } from "@/lib/lonaci/access";
import { CLIENT_STATUTS, CLIENT_CATEGORIES, normalizeClientCategorie } from "@/lib/lonaci/client-constants";
import {
  findClientById,
  sanitizeClientPublic,
  softDeleteClient,
  updateClient,
} from "@/lib/lonaci/clients";
import {
  normalizeProduitsAutorises,
} from "@/lib/lonaci/produit-autorises-validation";
import { findInvalidProduitAutorisesCodes } from "@/lib/lonaci/produit-autorises-validation.server";
import { requireApiAuth } from "@/lib/auth/guards";

const documentChecklistPatchSchema = z.array(
  z.object({
    itemId: z.string().min(1),
    statut: z.enum(["FOURNI", "MANQUANT", "EN_ATTENTE"]),
  }),
);

const patchSchema = z
  .object({
    categorie: z.enum(CLIENT_CATEGORIES).optional(),
    nomComplet: z.string().min(2).max(200).optional(),
    raisonSociale: z.string().min(2).max(300).optional(),
    cniNumero: z.preprocess(
      (v) => {
        if (v === undefined) return undefined;
        if (v === null || v === "") return null;
        if (typeof v !== "string") return null;
        const t = v.trim();
        return t === "" ? null : t;
      },
      z.union([z.string().min(4).max(64), z.null()]).optional(),
    ),
    nomContact: z.union([z.string().min(2).max(200), z.null()]).optional(),
    email: z.union([z.string().email(), z.null()]).optional(),
    telephone: z.union([z.string().min(6).max(32), z.null()]).optional(),
    adresse: z.union([z.string().max(500), z.null()]).optional(),
    ville: z.union([z.string().max(120), z.null()]).optional(),
    codePostal: z.union([z.string().max(12), z.null()]).optional(),
    agenceId: z.union([z.string().min(1), z.null()]).optional(),
    produitsAutorises: z.array(z.string().min(1)).optional(),
    documentChecklist: documentChecklistPatchSchema.optional(),
    statut: z.enum(CLIENT_STATUTS).optional(),
    notes: z.union([z.string().max(10000), z.null()]).optional(),
  })
  .strip();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const doc = await findClientById(id);
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!(await canReadClientDirectory(auth.user, doc))) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  return NextResponse.json({ client: sanitizeClientPublic(doc) }, { status: 200 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request);
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const rawBody = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return zodBadRequest(parsed.error);
  }

  const existing = await findClientById(id);
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!(await canReadClientDirectory(auth.user, existing))) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  if (!(await canMutateClientCore(auth.user, existing))) {
    return NextResponse.json({ message: "Modification interdite" }, { status: 403 });
  }

  if (parsed.data.agenceId !== undefined && parsed.data.agenceId !== existing.agenceId) {
    if (auth.user.role !== "CHEF_SERVICE") {
      return NextResponse.json(
        { message: "Changement d'agence réservé au rôle Chef(fe) de service" },
        { status: 403 },
      );
    }
  }

  if (parsed.data.produitsAutorises !== undefined) {
    const produitsAutorises = normalizeProduitsAutorises(parsed.data.produitsAutorises);
    const invalidProduits = await findInvalidProduitAutorisesCodes(produitsAutorises);
    if (invalidProduits.length > 0) {
      return NextResponse.json(
        { message: `Produits invalides: ${invalidProduits.join(", ")}`, code: "INVALID_PRODUCTS" },
        { status: 400 },
      );
    }
  }

  const patch = {
    ...parsed.data,
    ...(parsed.data.produitsAutorises !== undefined
      ? { produitsAutorises: normalizeProduitsAutorises(parsed.data.produitsAutorises) }
      : {}),
  };

  const nextCategorie = normalizeClientCategorie(patch.categorie ?? existing.categorie);
  const nextNomComplet = (patch.nomComplet ?? existing.nomComplet ?? "").trim();
  const nextRaisonSociale = (patch.raisonSociale ?? existing.raisonSociale ?? "").trim();

  if (nextCategorie === "ENTREPRISE" && nextRaisonSociale.length < 2) {
    return badRequest("La raison sociale est obligatoire pour une entreprise.", "CLIENT_RAISON_SOCIALE_REQUISE");
  }
  if (nextCategorie === "PARTICULIER" && nextNomComplet.length < 2) {
    return badRequest("Le nom complet est obligatoire pour un particulier.", "CLIENT_NOM_COMPLET_REQUIS");
  }

  if (patch.categorie !== undefined) patch.categorie = nextCategorie;
  if (patch.nomComplet !== undefined) patch.nomComplet = nextNomComplet;
  if (patch.raisonSociale !== undefined) patch.raisonSociale = nextRaisonSociale;

  try {
    const updated = await updateClient(id, patch, auth.user);
    if (!updated) {
      return NextResponse.json({ message: "Mise a jour impossible" }, { status: 500 });
    }

    return NextResponse.json({ client: sanitizeClientPublic(updated) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "CLIENT_STATUT_CHANGE_FORBIDDEN") {
      return NextResponse.json(
        { message: "Changement de statut réservé au Chef(fe) de service ou aux workflows de validation.", code },
        { status: 403 },
      );
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const existing = await findClientById(id);
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!(await canReadClientDirectory(auth.user, existing))) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  const ok = await softDeleteClient(id, auth.user);
  if (!ok) {
    return NextResponse.json({ message: "Desactivation impossible" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
