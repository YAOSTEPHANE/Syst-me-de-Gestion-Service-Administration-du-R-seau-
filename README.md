# ADMR - MVP (LONACI)

Base de demarrage du projet ADMR avec:
- Next.js (App Router)
- Turbopack pour le developpement (`next dev --turbopack`)
- MongoDB comme base de donnees

## Prerequis

- Node.js 20+
- MongoDB local ou distant

## Installation

1. Copier les variables d environnement:

```bash
cp .env.example .env.local
```

2. Mettre a jour `MONGODB_URI` et `MONGODB_DB` dans `.env.local`.

3. Installer les dependances:

```bash
npm install
```

## Lancer le projet

```bash
npm run dev -- --turbopack
```

Application: [http://localhost:3000](http://localhost:3000)

## Endpoint de verification

- `GET /api/health`: verifie l etat de connexion MongoDB

## Deploiement / hebergement

Voir [docs/HEBERGEMENT.md](docs/HEBERGEMENT.md) (architecture, MongoDB, variables d environnement, cron, SMTP) et [docs/RISQUES.md](docs/RISQUES.md) (securite, controles automatises).

## Guide utilisateur

[docs/GUIDE-UTILISATION.md](docs/GUIDE-UTILISATION.md) — connexion, navigation, modules, dossiers, import, exports.

## Qualite

- `npm run lint` — ESLint
- `npm test` — tests unitaires (Vitest)
- `npm run check:api-routes` — chaque route API doit utiliser `requireApiAuth` ou etre liste dans `src/config/public-api-routes.ts`

## Prochaines etapes MVP

- Authentification + RBAC (AGENT, CHEF_SECTION, ASSIST_CDS, CHEF_SERVICE)
- Referentiel Concessionnaires
- Workflow Dossiers (N1/N2/Finalisation)
- Modules Contrats/Cautions/Integrations/Resiliations/Deces
