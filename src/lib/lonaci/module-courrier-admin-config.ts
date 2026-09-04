import type { ModuleCourrierId } from "@/lib/lonaci/module-courrier-types";

export type ModuleCourrierAdminEntry = {
  moduleId: ModuleCourrierId;
  panelId: string;
  title: string;
  subtitle: string;
  panelTitle: string;
  description: string;
};

export const MODULE_COURRIER_ADMIN_ENTRIES: ModuleCourrierAdminEntry[] = [
  {
    moduleId: "attestation-domiciliation",
    panelId: "referentiels-courrier-attestation",
    title: "Courrier — Attestations & domiciliation",
    subtitle: "Modèle PDF : identité à gauche, date à droite, destinataire, objet, corps et signature.",
    panelTitle: "Courrier attestation & domiciliation",
    description: "Courrier adressé au DG pour les demandes d'attestation de revenus et de domiciliation.",
  },
  {
    moduleId: "succession",
    panelId: "referentiels-courrier-succession",
    title: "Courrier — Décès & ayants droit",
    subtitle: "Modèle PDF pour les dossiers de succession.",
    panelTitle: "Courrier succession",
    description: "Courrier de l'ayant droit pour l'instruction du dossier de succession.",
  },
  {
    moduleId: "cession",
    panelId: "referentiels-courrier-cession",
    title: "Courrier — Cessions",
    subtitle: "Modèle PDF pour les demandes de cession.",
    panelTitle: "Courrier cession",
    description: "Courrier du cédant pour accompagner la demande de cession.",
  },
  {
    moduleId: "delocalisation",
    panelId: "referentiels-courrier-delocalisation",
    title: "Courrier — Délocalisations",
    subtitle: "Modèle PDF pour les demandes de délocalisation de point de vente.",
    panelTitle: "Courrier délocalisation",
    description: "Courrier du concessionnaire pour accompagner une demande de délocalisation.",
  },
  {
    moduleId: "resiliation",
    panelId: "referentiels-courrier-resiliation",
    title: "Courrier — Résiliations",
    subtitle: "Modèle PDF pour les dossiers de résiliation de contrat.",
    panelTitle: "Courrier résiliation",
    description: "Courrier du concessionnaire pour accompagner une demande de résiliation.",
  },
  {
    moduleId: "dossier",
    panelId: "referentiels-courrier-dossier",
    title: "Courrier — Dossiers contrat",
    subtitle: "Modèle PDF pour la constitution des dossiers d'ouverture de contrat.",
    panelTitle: "Courrier dossier",
    description: "Courrier de l'intéressé pour accompagner la constitution du dossier contrat.",
  },
  {
    moduleId: "agrement",
    panelId: "referentiels-courrier-agrement",
    title: "Courrier — Agréments",
    subtitle: "Modèle PDF pour les dossiers d'agrément produit.",
    panelTitle: "Courrier agrément",
    description: "Courrier accompagnant le dépôt ou le suivi d'un agrément.",
  },
  {
    moduleId: "bancarisation",
    panelId: "referentiels-courrier-bancarisation",
    title: "Courrier — Bancarisation",
    subtitle: "Modèle PDF pour les demandes de changement de statut bancaire.",
    panelTitle: "Courrier bancarisation",
    description: "Courrier du concessionnaire pour une demande de bancarisation.",
  },
];
