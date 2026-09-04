import type { FairePartKind, FairePartTemplate } from "@/lib/lonaci/module-faire-part-types";

export const FAIRE_PART_DEFAULT_TEMPLATES: Record<FairePartKind, FairePartTemplate> = {
  demande: {
    destinataire: "Monsieur le Directeur Général\nLONACI",
    objet: "Demande de faire-part par l'ayant droit — réf. {{reference}}",
    corps: `Madame, Monsieur le Directeur Général,

Je soussigné(e) {{ayantDroit}}, ayant droit{{lienParenteSuffix}} du concessionnaire défunt {{defunt}} (code terminal {{codeTerminal}}), sollicite par la présente la publication d'un faire-part suite au décès survenu le {{dateDecesLong}}.

Cette demande est formulée au titre du dossier de succession référencé {{reference}}, agence {{agence}}.

Je reste à votre disposition pour tout complément d'information.

Veuillez agréer, Madame, Monsieur le Directeur Général, l'expression de ma considération distinguée.`,
    signatureLabel: "Signature de l'ayant droit",
  },
  dr: {
    destinataire: "Monsieur le Directeur Régional\nLONACI",
    objet: "Faire-part — décès du concessionnaire {{defunt}} — réf. {{reference}}",
    corps: `Monsieur le Directeur Régional,

Nous avons le triste devoir de vous faire part du décès de {{defunt}}, concessionnaire titulaire du code terminal {{codeTerminal}}, survenu le {{dateDecesLong}}.

Dossier de succession référencé {{reference}}, agence {{agence}}.
Ayant droit : {{ayantDroit}}{{lienParenteSuffix}}.

Nous vous prions d'agréer, Monsieur le Directeur Régional, l'expression de notre considération distinguée.`,
    signatureLabel: "Le Chef de Service",
  },
};

/** @deprecated Utiliser FAIRE_PART_DEFAULT_TEMPLATES.demande */
export const FAIRE_PART_DEFAULT_TEMPLATE = FAIRE_PART_DEFAULT_TEMPLATES.demande;
