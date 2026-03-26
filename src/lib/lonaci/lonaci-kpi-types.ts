/** Données agrégées pour le tableau de bord et la barre latérale */
export interface LonaciKpiAgenceTrend30j {
  agenceId: string | null;
  agenceLabel: string;
  agenceCode?: string;
  actif?: boolean;
  contrats30j: number;
  cautions30j: number;
  integrations30j: number;
  total30j: number;
}

export interface LonaciKpiTopConcessionnaire {
  concessionnaireId: string;
  codePdv: string;
  nomComplet: string;
  contratsActifs: number;
}

export interface LonaciKpiDossierDelays30j {
  avgSubmitHours: number;
  avgN1Hours: number;
  avgN2Hours: number;
  avgFinalizeHours: number;
  sampleSize: number;
}

export interface LonaciKpiProduitVolume30j {
  produitCode: string;
  current30d: number;
  previous30d: number;
  trendPct: number;
}

/** Libellés pour l’UI (cohérents avec les calculs serveur) */
export interface LonaciKpiAlertThresholds {
  cautionMaxDays: number;
  dossierIdleHours: number;
  pdvIntegrationMaxDays: number;
  agrementStaleDays: number;
  successionStaleDays: number;
}

export interface LonaciKpiPayload {
  alertThresholds?: LonaciKpiAlertThresholds;
  weekly: { contrats: { createdInWindow: number } };
  monthly: { contrats: { createdInWindow: number } };
  daily: {
    cautions: { enAttente: number };
    pdvIntegrations: { nonFinalise: number };
    concessionnaires: { byStatut: Record<string, number>; total?: number };
  };
  cautionsJ10: number;
  successionStale: number;
  successionStaleItems: { reference: string; daysInactive: number }[];
  activity7d: { label: string; contracts: number; cautions: number; integrations: number }[];
  produitSlices: { code: string; count: number }[];
  dossierValidation: {
    contratSoumis: number;
    contratSoumisRetard48h: number;
    cautionsEnAttente: number;
    cautionsJ10: number;
    pdvNonFinalise: number;
    pdvEnCoursRetard5j: number;
    successionOuverts: number;
    successionStale30j: number;
    agrementsEnAttente: number;
    agrementsRetard: number;
  };
  bancarisation: {
    nonBancarise: number;
    enCours: number;
    bancarise: number;
    total: number;
    tauxBancarisation: number;
  };
  /** Tendances par agence sur 30 jours (contrats, cautions, intégrations) */
  agenceTrends30j: LonaciKpiAgenceTrend30j[];
  /** Toutes les agences du référentiel avec volumes 30 j. (bandeau tableau de bord) */
  agencesOverview30j: LonaciKpiAgenceTrend30j[];
  /** Top PDV par nombre de contrats actifs */
  topConcessionnairesActifs: LonaciKpiTopConcessionnaire[];
  /** Délais moyens (heures) sur dossiers des 30 derniers jours */
  dossierDelays30j: LonaciKpiDossierDelays30j;
  /** Volumes de contrats par produit : 30 j courant vs 30 j précédent */
  produitVolumes30j: LonaciKpiProduitVolume30j[];
}
