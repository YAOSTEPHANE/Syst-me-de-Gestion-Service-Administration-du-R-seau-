import type { LonaciRole } from "@/lib/lonaci/constants";

/** Clé module (comptes utilisateurs) pour GPR / codes grattage. */
export const GRATTAGE_MODULE_KEY = "LONACI_REGISTRIES";

/** Rôles autorisés sur les API codes grattage (§9.1 / §9.2). */
export const GRATTAGE_API_ROLES: LonaciRole[] = [
  "AGENT",
  "CHEF_SECTION",
  "ASSIST_CDS",
  "CHEF_SERVICE",
  "DISPATCHER",
];

/** Rôles autorisés sur le circuit GPR (hors dispatcher). */
export const GPR_ADMIN_ROLES: LonaciRole[] = ["AGENT", "CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"];

export function userHasGrattageModule(modulesAutorises: string[] | null | undefined): boolean {
  if (!modulesAutorises?.length) return true;
  return modulesAutorises.includes("ADMIN") || modulesAutorises.includes(GRATTAGE_MODULE_KEY);
}

export function isDispatcherRole(role: LonaciRole | string | null | undefined): boolean {
  return role === "DISPATCHER";
}

export function canAccessGprRegistrations(role: LonaciRole): boolean {
  return GPR_ADMIN_ROLES.includes(role);
}

/** §9.3 — Gestion des contrats grattage (hors dispatcher). */
export const GRATTAGE_CONTRAT_ROLES: LonaciRole[] = [...GPR_ADMIN_ROLES];
