# Audit IDOR — routes API et fichiers (Infinitecore Systeme)

Inventaire des endpoints qui acceptent un identifiant (dossier, PDV, pièce jointe, etc.) et contrôle d’accès au périmètre **agence / concessionnaire**. Mis à jour lors du passage sécurité (correctifs sur les lignes marquées **Corrigé**).

## Légende

| Statut | Signification |
|--------|----------------|
| OK | Contrôle explicite (ex. `canReadConcessionnaire`, `userMatchesAgence`, ou ressource liée à `userId`). |
| Corrigé | Absence de contrôle identifiée puis **corrigée** dans le code. |
| À surveiller | Dépend du bon usage des filtres côté liste + rôles ; revue manuelle recommandée. |

## Téléchargements / flux binaires

| Route | Statut | Contrôle |
|-------|--------|----------|
| `GET /api/contrats/[dossierId]/export` | **Corrigé** | Dossier → PDV → `canReadConcessionnaire`. |
| `GET /api/agrements/[id]/document` | **Corrigé** | Si `concessionnaireId` : `canReadConcessionnaire` ; sinon `userMatchesAgence` sur `agenceId`. |
| `GET /api/cessions/[id]/attachments/[attachmentId]` | **Corrigé** | `canReadCessionScopeForUser` (national ou PDV lié cédant / bénéficiaire / concessionnaire). |
| `GET /api/resiliations/[id]/attachments/[attachmentId]` | **Corrigé** | PDV de la résiliation → `canReadConcessionnaire`. |
| `GET /api/succession-cases/[id]/documents/[documentId]` | OK | `findSuccessionCaseById` + `canReadConcessionnaire` sur le PDV du dossier. |

## Ressources métier par identifiant

| Route / famille | Statut | Notes |
|-----------------|--------|--------|
| `GET /api/dossiers/[id]` | OK | `canReadConcessionnaire` via PDV du dossier. |
| `POST /api/dossiers/[id]/transition` | OK | Logique dans `transitionDossier` (agence / rôle). |
| `GET /api/concessionnaires/[id]` (+ pièces, audit) | OK | Contrôles périmètre dans les handlers. |
| `POST /api/notifications/[id]/read` | OK | `markNotificationRead` filtre sur `userId` Mongo. |
| `GET /api/signatures/dossier/[token]` | OK | Accès **public** par design (secret dans l’URL) + rate limit. |
| `PATCH/DELETE /api/lonaci-registries/[id]` | **Corrigé** | `findRegistryById` + `userCanAccessRegistry` avant mutation. |
| Listes filtrables (contrats, registres, bancarisation, cessions, agréments, PDV, rapports, attestations, grattage, clients, etc.) | **Corrigé** | `resolveListAgenceFilter` / `requireListAgenceScope` impose le périmètre agence ; paramètre `agenceId` arbitraire refusé (403). |

## Actions recommandées (hors correctifs déjà faits)

1. Étendre les **tests d’intégration** : utilisateur agence A ne doit pas obtenir 200 sur les URLs ci-dessus avec des IDs d’agence B.
2. Pour les **listes** multi-agences, documenter le comportement des rôles `CHEF_SERVICE` / `SUPERVISEUR_REGIONAL` / `AUDITEUR` dans le guide métier.
3. Surveiller **`xlsx`** (CVE sans correctif communautaire) — préférer CSV pour les imports sensibles si possible ([RISQUES.md](./RISQUES.md)).

## Fichiers modifiés (correctifs IDOR + cron)

- `src/app/api/contrats/[dossierId]/export/route.ts`
- `src/app/api/agrements/[id]/document/route.ts`
- `src/app/api/cessions/[id]/attachments/[attachmentId]/route.ts`
- `src/app/api/resiliations/[id]/attachments/[attachmentId]/route.ts`
- `src/lib/lonaci/access.ts` — `canReadCessionScopeForUser`, `resolveListAgenceFilter`
- `src/lib/api/list-agence-scope.ts` — `requireListAgenceScope`
- `src/lib/lonaci/lonaci-registries.ts` — `findRegistryById`, `userCanAccessRegistry`
- `src/app/api/lonaci-registries/[id]/route.ts`
- `src/lib/lonaci/cessions.ts` — `getCessionAttachmentWithScope`
- `src/lib/lonaci/resiliations.ts` — `getResiliationAttachmentWithConcessionnaire`
- `src/lib/lonaci/agrements.ts` — métadonnées `agenceId` / `concessionnaireId` sur `getAgrementDocumentMeta`
- `src/lib/security/cron-auth.ts` — comparaison secret cron en temps constant
