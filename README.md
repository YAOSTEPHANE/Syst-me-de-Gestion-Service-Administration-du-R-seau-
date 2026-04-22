# ADMR - MVP (LONACI)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Base de demarrage du projet ADMR avec:

- Next.js (App Router)
- Turbopack pour le developpement (`next dev --turbopack`)
- MongoDB comme base de donnees

## Prerequis

- Node.js 20+
- MongoDB local ou distant

## Installation

1. Copier les variables d environnement :

```bash
cp .env.example .env.local
```

2. Mettre a jour `MONGODB_URI` et `MONGODB_DB` dans `.env.local` (ou `DATABASE_URL` pour Prisma, voir `docs/HEBERGEMENT.md`).

3. Installer les dependances :

```bash
npm install
```

4. (Optionnel) Verifier la connexion Mongo / Prisma :

```bash
npm run verify:db
```

## Lancer le projet

```bash
npm run dev -- --turbopack
```

Application: [http://127.0.0.1:3000](http://127.0.0.1:3000)

## Endpoint de verification

- `GET /api/health`: verifie l etat de connexion MongoDB

## Deploiement / hebergement

Voir [docs/HEBERGEMENT.md](docs/HEBERGEMENT.md) (architecture, MongoDB, variables d environnement, cron, SMTP) et [docs/RISQUES.md](docs/RISQUES.md) (securite, controles automatises).

## Guide utilisateur

[docs/GUIDE-UTILISATION.md](docs/GUIDE-UTILISATION.md) — connexion, navigation, modules, dossiers, import, exports.

## Licence

- Texte officiel GPLv3: [LICENSE](LICENSE)
- Version francaise (aide de lecture): [LICENSE.fr.md](LICENSE.fr.md)

## Qualite

- `npm run lint` — ESLint
- `npm test` — tests unitaires (Vitest)
- `npx tsc --noEmit` — verification TypeScript (y compris les fichiers de test)
- `npm run test:e2e` — tests navigateur (Playwright ; `npm run test:e2e:install` la premiere fois)
- `npm run test:all` — enchaine tests, tsc, checks API, build, lint et e2e
- `npm run check:api-routes` — chaque route API doit utiliser `requireApiAuth` ou etre liste dans `src/config/public-api-routes.ts`
- `npm run check:api-zod` — validation Zod attendue sur les entrees API
- `npm run verify:db` — ping Prisma + driver Mongo (meme base)

## Documentation developpeur

- [docs/DEVELOPPEMENT.md](docs/DEVELOPPEMENT.md) — structure du code, acces donnees (Prisma vs Mongo natif), commandes.

## Evolution du produit

Les fonctionnalites cles (auth, RBAC, referentiel, dossiers, modules metier) sont deja integrees ; les prochaines etapes dependent du backlog metier (nouveaux ecrans, exports, integations, performance).
