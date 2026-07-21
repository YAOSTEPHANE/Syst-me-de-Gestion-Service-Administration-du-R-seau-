import type { LonaciRole } from "@/lib/lonaci/constants";

/** Rôles autorisés sur les API de codes grattage. */
export const GRATTAGE_API_ROLES: LonaciRole[] = [
  "AGENT",
  "CHEF_SECTION",
  "ASSIST_CDS",
  "CHEF_SERVICE",
  "DISPATCHER",
];

/** Rôles autorisés sur le circuit GPR (hors dispatcher). */
export const GPR_ADMIN_ROLES: LonaciRole[] = ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"];

/** Gestion des contrats grattage (hors dispatcher). */
export const GRATTAGE_CONTRAT_ROLES: LonaciRole[] = [...GPR_ADMIN_ROLES];
