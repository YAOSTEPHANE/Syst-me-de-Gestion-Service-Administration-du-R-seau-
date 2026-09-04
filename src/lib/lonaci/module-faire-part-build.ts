import "server-only";

import { findConcessionnaireById } from "@/lib/lonaci/concessionnaires";
import {
  applyFairePartTemplate,
  buildFairePartContext,
} from "@/lib/lonaci/module-faire-part-interpolation";
import { getFairePartTemplate } from "@/lib/lonaci/module-faire-part-settings";
import type { ModuleCourrierRenderView } from "@/lib/lonaci/module-courrier-types";
import {
  FAIRE_PART_KIND_META,
  type FairePartKind,
} from "@/lib/lonaci/module-faire-part-types";
import { findAgenceById } from "@/lib/lonaci/referentials";
import { findVisibleSuccessionCaseById } from "@/lib/lonaci/succession";
import type { UserDocument } from "@/lib/lonaci/types";

async function agenceLabel(agenceId: string | null | undefined): Promise<string> {
  if (!agenceId?.trim()) return "—";
  const agence = await findAgenceById(agenceId.trim());
  if (!agence) return agenceId;
  return `${agence.code} — ${agence.libelle}`;
}

function splitNomComplet(nomComplet: string): { nom: string; prenoms: string } {
  const parts = nomComplet.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { nom: parts[0] ?? "—", prenoms: "—" };
  }
  return { nom: parts[parts.length - 1] ?? "—", prenoms: parts.slice(0, -1).join(" ") };
}

/**
 * Construit la vue PDF faire-part / demande pour un dossier de succession.
 */
export async function buildFairePartView(
  successionCaseId: string,
  actor: UserDocument,
  kind: FairePartKind = "demande",
): Promise<ModuleCourrierRenderView | null> {
  const meta = FAIRE_PART_KIND_META[kind];
  const row = await findVisibleSuccessionCaseById(successionCaseId, actor);
  if (!row) return null;

  const ayantNom = row.ayantDroitNom?.trim() || "";
  if (meta.requireAyantDroit && !ayantNom) {
    throw new Error("FAIRE_PART_AYANT_DROIT_REQUIRED");
  }

  const conc = await findConcessionnaireById(row.concessionnaireId);
  const generatedAt = new Date();
  const agence = await agenceLabel(row.agenceId);

  const defunt =
    conc?.nomComplet?.trim() ||
    conc?.raisonSociale?.trim() ||
    [conc?.prenom, conc?.nom].filter(Boolean).join(" ").trim() ||
    "—";

  const telephoneAyant = row.ayantDroitTelephone?.trim() || "";
  const emailAyant = row.ayantDroitEmail?.trim() || "";

  let expediteurNomComplet: string;
  let expediteurNom: string;
  let expediteurPrenoms: string;
  let telephone: string;
  let email: string;
  let signatureName: string;

  if (kind === "demande") {
    expediteurNomComplet = ayantNom;
    const names = splitNomComplet(ayantNom);
    expediteurNom = names.nom;
    expediteurPrenoms = names.prenoms;
    telephone = telephoneAyant;
    email = emailAyant;
    signatureName = ayantNom;
  } else {
    // Faire-part au DR : émis par le service LONACI / agence
    expediteurNomComplet = `LONACI — ${agence}`;
    expediteurNom = "LONACI";
    expediteurPrenoms = agence;
    telephone = "";
    email = "";
    signatureName = "LONACI";
  }

  const context = buildFairePartContext({
    nom: expediteurNom,
    prenoms: expediteurPrenoms,
    nomComplet: expediteurNomComplet,
    telephone,
    email,
    codeTerminal: conc?.codeTerminal?.trim() || conc?.codePdv?.trim() || "",
    codePdv: conc?.codePdv?.trim() || conc?.codeTerminal?.trim() || "",
    reference: row.reference,
    agence,
    ville: conc?.ville?.trim() || "Abidjan",
    generatedAt,
    defunt,
    dateDecesRaw: row.dateDeces ?? null,
    ayantDroit: ayantNom || "Non identifié",
    lienParente: row.ayantDroitLienParente?.trim() || "",
  });

  const template = await getFairePartTemplate(kind);
  const applied = applyFairePartTemplate(template, context);

  return {
    reference: row.reference,
    generatedAt,
    expediteur: {
      nom: context.nom,
      prenoms: context.prenoms,
      contacts: context.contacts,
      codeTerminal: context.codeTerminal,
    },
    destinataire: applied.destinataire,
    objet: applied.objet,
    corps: applied.corps,
    signatureLabel: applied.signatureLabel,
    signatureName,
    documentTitle: meta.documentTitle,
    documentLabel: meta.documentLabel,
    documentKind: meta.documentKind,
    expediteurLabel: meta.expediteurLabel,
  };
}
