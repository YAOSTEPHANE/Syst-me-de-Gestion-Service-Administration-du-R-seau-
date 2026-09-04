import type { AttestationDomiciliationType } from "@/lib/lonaci/constants";

/** Indicateurs du tableau de bord des attestations (safe Client Components). */
export interface AttestationsDomiciliationDashboardIndicators {
  type: AttestationDomiciliationType | null;
  agenceId: string | null;
  nombreDemandes: number;
  enCours: number;
  transmisDfc: number;
  finalise: number;
  valide: number;
  envoyeClient: number;
  tempsTraitementMoyenClientJours: number | null;
  tempsTraitementEchantillon: number;
  enAttentePlus7Jours: number;
  finaliseThisMonth: number;
  createdThisMonth: number;
  tauxFinalisationClientPct: number | null;
}
