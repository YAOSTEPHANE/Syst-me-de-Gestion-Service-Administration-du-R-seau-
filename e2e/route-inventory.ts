export type RouteFamily =
  | "pilotage"
  | "référentiels"
  | "dossiers"
  | "opérations"
  | "analyse"
  | "administration";

export type RouteInventoryItem = {
  path: string;
  label: string;
  family: RouteFamily;
};

export const AUTHENTICATED_ROUTES: readonly RouteInventoryItem[] = [
  { path: "/dashboard", label: "Tableau de bord", family: "pilotage" },
  { path: "/alertes", label: "Alertes", family: "pilotage" },
  { path: "/concessionnaires", label: "Concessionnaires", family: "référentiels" },
  { path: "/clients", label: "Clients", family: "référentiels" },
  { path: "/produits", label: "Produits", family: "référentiels" },
  { path: "/agrements", label: "Agréments", family: "dossiers" },
  { path: "/cautions", label: "Cautions", family: "dossiers" },
  { path: "/contrats", label: "Contrats", family: "dossiers" },
  { path: "/dossiers", label: "Dossiers", family: "dossiers" },
  { path: "/pdv-integrations", label: "Intégrations PDV", family: "dossiers" },
  { path: "/attestations-domiciliation", label: "Attestations", family: "dossiers" },
  { path: "/cessions", label: "Cessions", family: "opérations" },
  { path: "/resiliations", label: "Résiliations", family: "opérations" },
  { path: "/succession", label: "Successions", family: "opérations" },
  { path: "/bancarisation", label: "Bancarisation", family: "opérations" },
  { path: "/gpr", label: "Codes grattage", family: "opérations" },
  { path: "/contrats-grattage", label: "Contrats grattage", family: "opérations" },
  { path: "/registres", label: "Registres", family: "opérations" },
  { path: "/import", label: "Import", family: "opérations" },
  { path: "/rapports", label: "Rapports", family: "analyse" },
  { path: "/carte-pdv", label: "Carte PDV", family: "analyse" },
  { path: "/assistant-operations", label: "Assistant opérations", family: "analyse" },
  { path: "/parametres", label: "Paramètres", family: "administration" },
] as const;

export const SPECIAL_AUTHENTICATED_ROUTES = [
  { path: "/dispatcher", reason: "Réservée au rôle DISPATCHER" },
  { path: "/rapports/print", reason: "Vue d’impression sans shell" },
] as const;

export const PUBLIC_ROUTES = [
  { path: "/", expectedPath: "/login" },
  { path: "/login", expectedPath: "/login" },
  { path: "/offline", expectedPath: "/offline" },
] as const;
