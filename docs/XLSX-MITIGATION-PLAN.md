# Plan de mitigation `xlsx` (SheetJS community)

Contexte: `npm audit` remonte des vulnérabilités sur `xlsx` sans correctif disponible côté upstream community.

## Mesures immédiates (déjà en place)

- Parsing côté client (sélection explicite par l'utilisateur).
- Limites techniques dans `src/lib/spreadsheet/safe-xlsx-read.ts`:
  - taille max fichier: 5 Mo;
  - lignes max par feuille: 10 000;
  - feuilles max: 32;
  - cellules totales max: 200 000;
  - désactivation du parsing de formules (`cellFormula: false`).
- Politique import côté UI:
  - modules critiques (`CONTRATS`, `CAUTIONS`, `BANCARISATION`, `PDV_INTEGRATIONS`) en mode CSV/JSON/PDF par défaut;
  - dérogation progressive via `NEXT_PUBLIC_IMPORT_ALLOW_EXCEL_MODULES` (liste de modules, ou `*` pour mode legacy).
- Tests automatisés:
  - `src/lib/spreadsheet/safe-xlsx-read.test.ts`.
  - `src/lib/spreadsheet/import-format-policy.test.ts`.

## Mesures court terme (1 sprint)

- Ajouter télémétrie import:
  - type de fichier importé (`csv/json/xlsx`);
  - motifs de rejet (`taille`, `lignes`, `feuilles`, `densité`).
- Forcer `CSV/JSON` pour imports d'administration critiques (option de politique par module).
- Ajouter un message UI: "format recommandé = CSV".

## Mesures moyen terme (2 à 4 sprints)

- Évaluer remplacement `xlsx`:
  - option A: migration complète vers CSV + schéma strict;
  - option B: bibliothèque alternative avec maintenance active.
- Faire une décision architecture (ADR) avec:
  - coût de migration,
  - impact UX,
  - niveau de sécurité attendu.

## Gouvernance

- Suivre les advisories `GHSA-4r6h-8v6p-xvw6` et `GHSA-5pgg-2g8v-p4x9`.
- Revue mensuelle du risque dépendance jusqu'à suppression de `xlsx` ou publication d'un correctif.
