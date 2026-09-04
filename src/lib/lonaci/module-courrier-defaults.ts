import type { ModuleCourrierId, ModuleCourrierTemplate } from "@/lib/lonaci/module-courrier-types";

export const MODULE_COURRIER_DEFAULTS: Record<ModuleCourrierId, ModuleCourrierTemplate> = {
  "attestation-domiciliation": {
    destinataire: "Monsieur le Directeur Général\nLONACI",
    objet: "Demande d'attestation de revenus et de domiciliation",
    corps: `Madame, Monsieur le Directeur Général,

Par la présente, je soussigné(e) {{nomComplet}}, concessionnaire titulaire du code terminal {{codeTerminal}}, sollicite la délivrance d'une attestation de revenus et de domiciliation.

Je reste à votre disposition pour tout complément d'information.

Veuillez agréer, Madame, Monsieur le Directeur Général, l'expression de ma considération distinguée.`,
    signatureLabel: "Signature de l'intéressé(e)",
  },
  succession: {
    destinataire: "Monsieur le Chef de Service\nLONACI",
    objet: "Dossier de succession — réf. {{reference}}",
    corps: `Madame, Monsieur,

Je soussigné(e) {{nomComplet}}, ayant droit du point de vente {{codeTerminal}}, vous prie de bien vouloir instruire le dossier de succession référencé {{reference}}.

Je certifie l'exactitude des renseignements communiqués et reste disponible pour toute pièce complémentaire.

Cordialement.`,
    signatureLabel: "Signature de l'intéressé(e)",
  },
  cession: {
    destinataire: "Monsieur le Chef de Service\nLONACI",
    objet: "Demande de cession — réf. {{reference}}",
    corps: `Madame, Monsieur,

Je soussigné(e) {{nomComplet}}, cédant du point de vente {{codeTerminal}}, dépose par la présente ma demande de cession référencée {{reference}}.

Je certifie l'exactitude des informations communiquées.

Cordialement.`,
    signatureLabel: "Signature de l'intéressé(e)",
  },
  delocalisation: {
    destinataire: "Monsieur le Chef de Service\nLONACI",
    objet: "Demande de délocalisation — réf. {{reference}}",
    corps: `Madame, Monsieur,

Je soussigné(e) {{nomComplet}}, concessionnaire du point de vente {{codeTerminal}}, sollicite la délocalisation de mon activité, dossier référencé {{reference}}.

Je reste disponible pour toute pièce complémentaire.

Cordialement.`,
    signatureLabel: "Signature de l'intéressé(e)",
  },
  resiliation: {
    destinataire: "Monsieur le Chef de Service\nLONACI",
    objet: "Demande de résiliation — réf. {{reference}}",
    corps: `Madame, Monsieur,

Je soussigné(e) {{nomComplet}}, titulaire du point de vente {{codeTerminal}}, vous informe par la présente de ma demande de résiliation, dossier référencé {{reference}}.

Je certifie l'exactitude des renseignements communiqués.

Cordialement.`,
    signatureLabel: "Signature de l'intéressé(e)",
  },
  dossier: {
    destinataire: "Monsieur le Chef de Service\nLONACI",
    objet: "Constitution de dossier — réf. {{reference}}",
    corps: `Madame, Monsieur,

Je soussigné(e) {{nomComplet}}, identifiant {{codeTerminal}}, dépose le dossier référencé {{reference}} pour l'ouverture de mon contrat.

Je certifie l'exactitude des pièces transmises.

Cordialement.`,
    signatureLabel: "Signature de l'intéressé(e)",
  },
  agrement: {
    destinataire: "Monsieur le Chef de Service\nLONACI",
    objet: "Dossier agrément — réf. {{reference}}",
    corps: `Madame, Monsieur,

Je soussigné(e) {{nomComplet}}, vous prie de bien vouloir instruire le dossier d'agrément référencé {{reference}}.

Je reste à votre disposition pour tout complément d'information.

Cordialement.`,
    signatureLabel: "Signature de l'intéressé(e)",
  },
  bancarisation: {
    destinataire: "Monsieur le Chef de Service\nLONACI",
    objet: "Demande de bancarisation — réf. {{reference}}",
    corps: `Madame, Monsieur,

Je soussigné(e) {{nomComplet}}, concessionnaire du point de vente {{codeTerminal}}, sollicite le traitement de ma demande de bancarisation, référencée {{reference}}.

Je certifie l'exactitude des informations communiquées.

Cordialement.`,
    signatureLabel: "Signature de l'intéressé(e)",
  },
};

export const MODULE_COURRIER_LABELS: Record<ModuleCourrierId, string> = {
  "attestation-domiciliation": "Attestations & domiciliation",
  succession: "Décès & ayants droit",
  cession: "Cessions",
  delocalisation: "Délocalisations",
  resiliation: "Résiliations",
  dossier: "Dossiers contrat",
  agrement: "Agréments",
  bancarisation: "Bancarisation",
};
