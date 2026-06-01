# Guide développement Infinitecore Systeme

Ce document complète le [README](../README.md) pour les contributeurs techniques.

## Arborescence utile

| Chemin | Rôle |
|--------|------|
| `src/app/(lonaci)/` | Pages métier protégées (session obligatoire) |
| `src/app/api/` | Route Handlers Next (`route.ts`) |
| `src/components/lonaci/` | UI shell, panneaux par domaine |
| `src/lib/lonaci/` | Logique métier, accès données (souvent Mongo natif) |
| `src/lib/auth/` | Session, JWT, guards, RBAC |
| `src/config/public-api-routes.ts` | Routes API sans `requireApiAuth` (publiques ou déléguées) |
| `prisma/schema.prisma` | Modèles Prisma sur MongoDB |
| `e2e/` | Tests Playwright |
| `scripts/` | Seeds, vérifications statiques, `verify-db` |

## Accès aux données

Deux clients coexistent sur **la même base MongoDB** :

1. **`prisma`** (`src/lib/prisma.ts`) — pour tout ce qui est déjà dans `schema.prisma` (ex. utilisateurs, concessionnaires).
2. **`getDatabase()`** (`src/lib/mongodb.ts`) — driver natif pour le reste des collections métier.

Un point d’entrée documenté regroupe les exports : **`src/lib/db.ts`** (à utiliser pour les nouveaux modules si besoin d’un import unique).

Règle pratique : **nouveau code** → préférer **Prisma** si vous ajoutez un modèle au schéma ; sinon **driver natif** comme le reste de `lib/lonaci/*`.

## Authentification et API

- Garde standard : **`requireApiAuth`** dans chaque `route.ts` (vérifié par `npm run check:api-routes`).
- RBAC inféré depuis le chemin + modules utilisateur : **`src/lib/auth/guards.ts`** (`inferModuleKeyFromPath`, `inferRbacResourceFromPath`).
- Validation : **Zod** + helpers `src/lib/api/` ; vérification repo : `npm run check:api-zod`.

## Commandes

| Commande | Usage |
|----------|--------|
| `npm run dev` | Serveur de dev (Turbopack, `127.0.0.1`) |
| `npm test` | Vitest (tests `*.test.ts`) |
| `npx tsc --noEmit` | TypeScript sur tout le dépôt |
| `npm run test:e2e` | Playwright (serveur démarré par la config) |
| `npm run test:all` | Chaîne complète CI locale (tests + tsc + checks + build + lint + e2e) |
| `npm run verify:db` | Ping Prisma + Mongo natif (nécessite Mongo joignable) |
| `npm run check:api-routes` | Auth sur les routes API |
| `npm run check:api-zod` | Présence validation Zod sur les handlers |
| `npm run security` | Audit npm (`audit-ci`) + checks API auth/Zod |
| `npm run audit:deps` | CVE dépendances (allowlist `xlsx` dans `audit-ci.jsonc`) |
| `npm run scan:semgrep` | SAST Semgrep (nécessite [Semgrep CLI](https://semgrep.dev/docs/getting-started/) installé) |
| `npm run lint` | ESLint (+ règles `eslint-plugin-security` sur `api/`, `lib/`, `scripts/`) |

Variables : copier `.env.example` vers `.env.local` ; voir aussi `docs/HEBERGEMENT.md`.

## Sécurité (extensions Cursor recommandées)

- **Snyk Security** ou **SonarLint** — alertes à l’édition
- **CI** : job `semgrep` (OWASP / TypeScript / Next.js) + `npm run audit:deps` dans `quality`

Voir aussi `docs/RISQUES.md`, `docs/SECURITY-IDOR-AUDIT.md`.

## Qualité avant merge

Idéalement exécuter **`npm run test:all`** avant une PR ; à minima `npm test` + `npx tsc --noEmit` + `npm run security` + `npm run lint`.
