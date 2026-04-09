/**
 * Référentiel concessionnaires : profils agents via `users.modulesAutorises`.
 *
 * - **CONCESSIONNAIRES** — action / saisie : lecture + création, modification, pièces, désactivation.
 * - **CONCESSIONNAIRES_LECTURE** — suivi / lecture seule : GET uniquement (liste, fiche, export, audit, pièces en téléchargement).
 *
 * **Bancarisation** (`/api/bancarisation`) : uniquement **saisie** — avec `modulesAutorises` non vide, il faut `CONCESSIONNAIRES`
 * (`CONCESSIONNAIRES_LECTURE` seul ne suffit pas, toutes méthodes y compris GET et exports).
 *
 * Si `modulesAutorises` est vide, comportement historique : pas de filtre module (les rôles métier s’appliquent seuls).
 */

export const MODULE_CONCESSIONNAIRES_SAISIE = "CONCESSIONNAIRES";
export const MODULE_CONCESSIONNAIRES_LECTURE = "CONCESSIONNAIRES_LECTURE";

/** True si l’utilisateur peut muter le référentiel (POST/PATCH/DELETE sur /api/concessionnaires/*). */
export function userHasConcessionnairesSaisieModule(modulesAutorises: string[]): boolean {
  if (!modulesAutorises.length) {
    return true;
  }
  return modulesAutorises.includes(MODULE_CONCESSIONNAIRES_SAISIE);
}

/** True si l’utilisateur peut appeler les GET sur /api/concessionnaires/* (y compris export). */
export function userHasConcessionnairesLectureModule(modulesAutorises: string[]): boolean {
  if (!modulesAutorises.length) {
    return true;
  }
  return (
    modulesAutorises.includes(MODULE_CONCESSIONNAIRES_SAISIE) ||
    modulesAutorises.includes(MODULE_CONCESSIONNAIRES_LECTURE)
  );
}
