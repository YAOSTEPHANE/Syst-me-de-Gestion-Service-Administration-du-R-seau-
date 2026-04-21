# Risques et mesures associées — LONACI

Ce document prolonge l’audit sécurité / exploitation : pour chaque famille de risque, on indique l’**exposition** et les **actions** déjà en place ou recommandées dans le dépôt.

---

## 1. Sécurité applicative (surface API, auth, en-têtes)

| Risque | Mesures dans le projet |
|--------|-------------------------|
| Nouvelle route API sans garde | Liste des routes **sans** `requireApiAuth` centralisée dans `src/config/public-api-routes.ts`. **`npm run check:api-routes`** échoue si un `route.ts` n’est ni protégé ni listé (à lancer en CI). |
| IDOR sur exports / pièces jointes | Inventaire et correctifs documentés dans **[SECURITY-IDOR-AUDIT.md](./SECURITY-IDOR-AUDIT.md)** (exports PDF dossier, documents agrément, PJ cession / résiliation). |
| Auth uniquement par handler | **`src/proxy.ts`** (Next.js 16, incompatible avec `middleware.ts` simultané) : **cookie obligatoire** sur `/api/*` sauf chemins publics listés ; en-tête **`X-Request-Id`** ; blocage **TRACE** / **TRACK**. Les handlers gardent **`requireApiAuth`** (JWT, rôles, modules) en double filet. |
| CORS trop permissif | En prod, si `CORS_ALLOWED_ORIGINS` est vide, le proxy applique un mode **fail-closed** (preflight refusé). Renseigner explicitement les origines autorisées. |
| CSP trop permissive / XSS | Par défaut **Report-Only** dans `next.config.ts`. Pour durcir après tests : **`ENABLE_CSP_ENFORCE=true`** au **build** (passe en `Content-Security-Policy` bloquant). |
| Secrets dans le dépôt | Ne versionner que **`.env.example`** avec des placeholders. Rotation immédiate si fuite. |

---

## 2. Dépendances et fichiers (notamment Excel)

| Risque | Mesures dans le projet |
|--------|-------------------------|
| CVE `xlsx` / parsing malveillant | `npm audit` signale **Prototype Pollution** et **ReDoS** (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9) sur le paquet **`xlsx`** : **aucun correctif** n’est publié sur la branche community (`No fix available`). Mesures côté app : plafonds **5 Mo**, **10 000 lignes**, **32 feuilles**, **200 000 cellules max** (`safe-xlsx-read.ts`), parsing surtout **côté navigateur** après choix utilisateur (fichiers non automatiques), et **Excel désactivé par défaut sur modules critiques** (contrats, cautions, bancarisation, intégrations PDV) avec feature flag de transition `NEXT_PUBLIC_IMPORT_ALLOW_EXCEL_MODULES`. Plan de mitigation détaillé : **[XLSX-MITIGATION-PLAN.md](./XLSX-MITIGATION-PLAN.md)**. **Éviter** `npm audit fix --force` uniquement pour `xlsx` : cela ne résout pas cette alerte et peut bouger d’autres dépendances. |
| Chaîne npm | Garder **`prisma` et `@prisma/client` à la même version**. Mettre à jour Next / deps après lecture des changelogs. |

---

## 3. Données et exploitation MongoDB

| Risque | Mesures recommandées |
|--------|----------------------|
| Cluster exposé | IP allowlist / Private Endpoint, utilisateur DB à **privilèges minimaux**. |
| Prisma + client natif | Deux chemins vers les mêmes données : garder **schéma Prisma** et **collections** alignés ; documenter les index métier. |
| Perte de données | Sauvegardes Atlas (ou équivalent), **tests de restauration** périodiques. |

---

## 4. Exploitation (cron, e-mail, rate limit)

| Risque | Mesures dans le projet |
|--------|-------------------------|
| Cron abusif | **`CRON_SECRET`** + en-têtes `Authorization: Bearer` ou `x-cron-secret`. En prod sans secret : **503** sur la route. Log d’avertissement au démarrage si `CRON_SECRET` manquant (`src/lib/env.ts`). |
| Pas d’e-mails | **`SMTP_*`** / `EMAIL_FROM` ; avertissement si `SMTP_HOST` absent en prod. |
| Rate limit fail-open | **`RATE_LIMIT_FAIL_CLOSED=true`** pour refuser le trafic si le compteur Mongo est HS. Avertissement en prod si non activé (`src/lib/env.ts`). |

Tests unitaires : logique cron dans `src/lib/security/cron-auth.ts` (`npm test`).

---

## 5. Qualité logicielle

| Risque | Mesures dans le projet |
|--------|-------------------------|
| Régressions | **Vitest** : `npm test` (ex. `cron-auth.test.ts`). À étendre (login, guards, parsers). |
| Régressions API | **`npm run check:api-routes`** + **`npm run lint`**. |

---

## 6. Conformité et données personnelles

| Risque | Piste d’action |
|--------|----------------|
| RGPD / loi locale | Registre des traitements, durées de conservation, droits d’accès, DPA avec l’hébergeur et Atlas. |
| Localisation | Choisir **régions UE** pour l’app et MongoDB si requis — voir [HEBERGEMENT.md](./HEBERGEMENT.md). |

---

## Commandes utiles

```bash
npm run lint
npm test
npm run check:api-routes
npm audit
```

Intégration CI : voir `.github/workflows/ci.yml`.
