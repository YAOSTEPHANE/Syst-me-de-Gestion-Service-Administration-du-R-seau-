/** Limite de marqueurs renvoyés par l’API carte (alignée sur le serveur). */
export const CONCESSIONNAIRES_MAP_POINTS_MAX = 2000;

/** DTO carte PDV — partagé API / client (sans dépendance Prisma). */
export type ConcessionnaireMapPointDto = {
  id: string;
  codePdv: string;
  label: string;
  lat: number;
  lng: number;
};

export type ConcessionnairesMapPointsResponse = {
  points: ConcessionnaireMapPointDto[];
  /** Nombre de PDV avec coordonnées valides (filtres appliqués). */
  totalWithGps: number;
  /** True si d’autres points existent au-delà de la limite renvoyée. */
  truncated: boolean;
};
