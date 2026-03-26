import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  canMutateConcessionnaireCore,
  canEditNotesInternesWhenBlocked,
  canReadConcessionnaire,
  isStatutFicheGelee,
} from "@/lib/lonaci/access";
import { BANCARISATION_STATUTS, CONCESSIONNAIRE_STATUTS } from "@/lib/lonaci/constants";
import {
  ensureConcessionnaireIndexes,
  findConcessionnaireById,
  sanitizeConcessionnairePublic,
  softDeleteConcessionnaire,
  updateConcessionnaire,
} from "@/lib/lonaci/concessionnaires";
import { findAgenceById, listProduits } from "@/lib/lonaci/referentials";
import { requireApiAuth } from "@/lib/auth/guards";

/** E-mail vide ou invalide en base → null (évite 400 Zod sur enregistrement sans toucher au champ). */
function preprocessEmail(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (t === "") return null;
  return z.string().email().safeParse(t).success ? t : null;
}

const patchSchema = z
  .object({
    nomComplet: z.string().min(2).optional(),
    cniNumero: z.preprocess(
      (v) => {
        if (v === undefined) return undefined;
        if (v === null || v === "") return null;
        if (typeof v !== "string") return null;
        const t = v.trim();
        if (t === "") return null;
        if (t.length < 4) return null;
        return t;
      },
      z.union([z.string().min(4).max(64), z.null()]).optional(),
    ),
    photoUrl: z.union([z.string().max(2000), z.null()]).optional(),
    email: z.preprocess(preprocessEmail, z.union([z.string().email(), z.null()]).optional()),
    telephonePrincipal: z.union([z.string().min(8).max(32), z.null()]).optional(),
    telephoneSecondaire: z.union([z.string().min(8).max(32), z.null()]).optional(),
    adresse: z.union([z.string().max(500), z.null()]).optional(),
    ville: z.union([z.string().max(120), z.null()]).optional(),
    codePostal: z.union([z.string().max(12), z.null()]).optional(),
    agenceId: z.union([z.string().min(1), z.null()]).optional(),
    produitsAutorises: z.array(z.string().min(1)).optional(),
    statut: z.enum(CONCESSIONNAIRE_STATUTS).optional(),
    statutBancarisation: z.enum(BANCARISATION_STATUTS).optional(),
    compteBancaire: z.union([z.string().max(128), z.null()]).optional(),
    banqueEtablissement: z.union([z.string().max(200), z.null()]).optional(),
    gps: z
      .object({
        lat: z.coerce.number().gte(-90).lte(90),
        lng: z.coerce.number().gte(-180).lte(180),
      })
      .nullable()
      .optional(),
    observations: z.union([z.string().max(10000), z.null()]).optional(),
    notesInternes: z.union([z.string().max(10000), z.null()]).optional(),
  })
  .strip();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  await ensureConcessionnaireIndexes();
  const doc = await findConcessionnaireById(id);
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!canReadConcessionnaire(auth.user, doc)) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  return NextResponse.json({ concessionnaire: sanitizeConcessionnairePublic(doc) }, { status: 200 });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  const rawBody = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(rawBody);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first
      ? `${first.path.length ? `${first.path.join(".")}: ` : ""}${first.message}`
      : "Donnees invalides";
    console.error("[PATCH concessionnaire] Donnees invalides", {
      concessionnaireId: id,
      detail,
      issues: parsed.error.issues,
    });
    return NextResponse.json(
      { message: `Donnees invalides (${detail})`, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await ensureConcessionnaireIndexes();
  const existing = await findConcessionnaireById(id);
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!canReadConcessionnaire(auth.user, existing)) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  if (isStatutFicheGelee(existing.statut)) {
    const keys = Object.keys(parsed.data);
    const onlyNotes = keys.length === 1 && keys[0] === "notesInternes";
    if (!onlyNotes || !canEditNotesInternesWhenBlocked(auth.user)) {
      return NextResponse.json(
        {
          message:
            "Statut resilie ou decede : seules les notes internes peuvent etre modifiees (un seul champ dans la requete).",
        },
        { status: 403 },
      );
    }
    const updated = await updateConcessionnaire(id, { notesInternes: parsed.data.notesInternes ?? null }, auth.user);
    if (!updated) {
      return NextResponse.json({ message: "Mise a jour impossible" }, { status: 500 });
    }
    return NextResponse.json({ concessionnaire: sanitizeConcessionnairePublic(updated) });
  }

  if (!canMutateConcessionnaireCore(auth.user, existing)) {
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

  if (parsed.data.statut === "RESILIE" || parsed.data.statut === "DECEDE") {
    if (auth.user.role !== "CHEF_SERVICE") {
      return NextResponse.json(
        { message: "Passage en résilié / décédé réservé au rôle Chef(fe) de service" },
        { status: 403 },
      );
    }
  }

  // Validation agence : on ne bloque que si l'utilisateur change l'agence.
  // Cas à ne pas empêcher : sauvegarde d'autres champs quand la fiche contient une agence
  // "orpheline" (référentiel incohérent) ou une agence inactive (la fiche peut l'avoir déjà).
  if (parsed.data.agenceId !== undefined && parsed.data.agenceId !== existing.agenceId) {
    if (parsed.data.agenceId) {
      const agence = await findAgenceById(parsed.data.agenceId);
      if (!agence) {
        console.warn("[PATCH concessionnaire] Agence inconnue (changement demandé)", {
          concessionnaireId: id,
          agenceId: parsed.data.agenceId,
          existingAgenceId: existing.agenceId,
        });
        return NextResponse.json({ message: "Agence inconnue" }, { status: 400 });
      }
      if (!agence.actif) {
        return NextResponse.json(
          {
            message:
              "Agence invalide ou inactive (choisir une agence active pour un nouveau rattachement).",
          },
          { status: 400 },
        );
      }
    }
    // parsed.data.agenceId === null => autorisé (sans agence)
  }
  if (parsed.data.produitsAutorises) {
    const produits = await listProduits();
    /** Toujours comparer en majuscules (référentiel / fiche peuvent différer en casse). */
    const codesActifs = new Set(
      produits.filter((p) => p.actif).map((p) => p.code.trim().toUpperCase()),
    );
    const codesDejaSurFiche = new Set(
      (existing.produitsAutorises ?? []).map((c) => c.trim().toUpperCase()),
    );
    /**
     * Nouveau produit coché : doit être actif dans le référentiel.
     * Produit déjà sur la fiche : on peut l’enregistrer même si inactif ou « orphelin » (legacy).
     */
    const invalidProduits = parsed.data.produitsAutorises.filter((code) => {
      const u = code.trim().toUpperCase();
      if (codesActifs.has(u)) return false;
      if (codesDejaSurFiche.has(u)) return false;
      return true;
    });
    if (invalidProduits.length > 0) {
      console.warn("[PATCH concessionnaire] Produits invalides", {
        concessionnaireId: id,
        invalidProduits,
      });
      return NextResponse.json(
        { message: `Produits invalides: ${invalidProduits.join(", ")}` },
        { status: 400 },
      );
    }
  }
  if (parsed.data.statutBancarisation === "BANCARISE") {
    const c = parsed.data.compteBancaire;
    const compteManquant = c == null || (typeof c === "string" && c.trim() === "");
    if (compteManquant) {
      console.warn("[PATCH concessionnaire] Compte bancaire manquant", {
        concessionnaireId: id,
      });
      return NextResponse.json(
        { message: "Le numero de compte bancaire est requis pour BANCARISE." },
        { status: 400 },
      );
    }
  }

  const patch = {
    ...parsed.data,
    produitsAutorises: parsed.data.produitsAutorises?.map((code) => code.trim().toUpperCase()),
  };

  const updated = await updateConcessionnaire(id, patch, auth.user);
  if (!updated) {
    return NextResponse.json({ message: "Mise a jour impossible" }, { status: 500 });
  }

  return NextResponse.json({ concessionnaire: sanitizeConcessionnairePublic(updated) });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAuth(request, {
    roles: ["ASSIST_CDS", "CHEF_SERVICE"],
  });
  if ("error" in auth) {
    return auth.error;
  }

  const { id } = await context.params;
  await ensureConcessionnaireIndexes();
  const existing = await findConcessionnaireById(id);
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ message: "Non trouve" }, { status: 404 });
  }

  if (!canReadConcessionnaire(auth.user, existing)) {
    return NextResponse.json({ message: "Acces refuse" }, { status: 403 });
  }

  const ok = await softDeleteConcessionnaire(id, auth.user);
  if (!ok) {
    return NextResponse.json({ message: "Desactivation impossible" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, statut: "INACTIF" }, { status: 200 });
}
