# Guide d’hébergement — LONACI (ADMR)

Ce document décrit comment héberger l’application en conditions proches de la production : composants, options d’hébergeur, variables d’environnement, tâches planifiées et bonnes pratiques.

**Risques et durcissement** : voir [RISQUES.md](./RISQUES.md) (CSP, cron, rate limit, contrôle des routes API).

## 1. Architecture logique

| Composant | Rôle |
|-----------|------|
| **Application Next.js** | UI + routes API (`next build` / `next start` ou équivalent managé). |
| **MongoDB** | Données métier (client natif) + schéma Prisma (`User`, etc.). |
| **SMTP** | E-mails (réinitialisation mot de passe, alertes workflow si activées). |
| **Planificateur (cron)** | Appels HTTP **POST** vers `/api/cron/daily-jobs` avec secret dédié. |

La base MongoDB est en pratique **séparée** de l’hébergement de l’app (souvent **MongoDB Atlas** ou cluster managé).

## 2. Prérequis runtime

- **Node.js 20+** (aligné sur le README du projet).
- **Build** : `npm ci` (ou `npm install`) puis `npm run prisma:generate` puis `npm run build`.
- **Démarrage** : `npm run start` (port défaut **3000**, configurable via `PORT` selon la plateforme).

En production, définir **`NODE_ENV=production`**.

## 3. Options d’hébergement (application)

### 3.1 Plateforme managée (recommandé pour un MVP)

- **Vercel** : intégration native avec Next.js, déploiements Git, prévisualisations par branche. Configurer les variables d’environnement dans le tableau de bord. Les **Cron Jobs** Vercel peuvent déclencher la route cron (voir § 6).
- **Render** : service Web Node + **Cron Jobs** intégrés pour appeler l’URL de prod.
- **Railway**, **Fly.io**, etc. : modèle conteneur / processus Node ; même principe (build, `next start`, env vars).

### 3.2 VPS ou cloud IaaS

- Image ou conteneur avec Node 20+, **reverse proxy** (Nginx, Caddy) devant l’app pour **HTTPS** et éventuellement limites de débit.
- Process manager (**systemd**, **PM2**) pour relancer `next start` en cas de crash.
- Sauvegardes et mises à jour OS à votre charge.

### 3.3 Choix de région

Pour la latence et la conformité (données en UE), privilégier une région **européenne** pour l’app **et** pour le cluster MongoDB (ex. Paris, Francfort, Dublin selon l’offre).

## 4. MongoDB (production)

1. Créer un cluster (ex. **MongoDB Atlas**).
2. Utilisateur applicatif avec droits limités sur la base cible (ex. `lonaci`).
3. Chaîne **`DATABASE_URL`** (format `mongodb+srv://...`) avec le **nom de base** dans le chemin, ex. `.../lonaci?retryWrites=true&w=majority`.
4. **Réseau** : restreindre les IP entrantes (allowlist des sorties de votre hébergeur) ou **Private Endpoint** / VPC selon votre niveau d’exigence.
5. Après déploiement du schéma : depuis un environnement ayant accès à la base, exécuter  
   `npx prisma db push`  
   (voir script `npm run prisma:push` — à lancer en CI/CD ou manuellement lors des évolutions de schéma, pas à chaque requête utilisateur).

`MONGODB_URI` / `MONGODB_DB` sont optionnels si `DATABASE_URL` pointe déjà vers le même cluster ; le code réutilise alors Prisma pour l’URI et déduit le nom de base si possible (voir `src/lib/env.ts`).

## 5. Variables d’environnement (production)

Référence complète des clés : **`.env.example`** à la racine du dépôt. En production, configurer au minimum :

| Variable | Obligation | Remarque |
|----------|------------|----------|
| `DATABASE_URL` | **Oui** | Connexion MongoDB + base (Prisma + client natif). |
| `JWT_SECRET` | **Oui** | **≥ 32 caractères**, aléatoire, jamais la valeur de dev. |
| `CRON_SECRET` | Fortement recommandé | Secret long pour sécuriser `POST /api/cron/daily-jobs`. Sans secret configuré, la route peut refuser le service (comportement défensif). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Recommandé | Sans `SMTP_HOST`, un avertissement est émis au démarrage ; les e-mails peuvent être indisponibles. |
| `EMAIL_FROM` | Optionnel | Expéditeur ; défaut possible via `SMTP_USER`. |
| `ENABLE_CSP_ENFORCE` | Optionnel | Si `true` **au build** Next : en-tête `Content-Security-Policy` **bloquant** au lieu de Report-Only (à activer après validation des rapports CSP). |
| `RATE_LIMIT_FAIL_CLOSED` | Recommandé en prod sensible | `true` : en cas d’erreur Mongo sur le rate limit, refuser la requête au lieu de fail-open. |

Variables optionnelles utiles : `NEXT_PUBLIC_APP_NAME`, intégration **GPR** (`GPR_API_*`), délais Mongo (`MONGODB_CONNECT_TIMEOUT_MS`, etc.).

**Ne jamais** committer `.env` ou `.env.local`. Ne mettre dans `.env.example` que des **placeholders**, jamais de vrais mots de passe.

## 6. Tâches planifiées (cron)

La route **`POST /api/cron/daily-jobs`** attend :

- En-tête **`Authorization: Bearer <CRON_SECRET>`**  
  **ou**  
- En-tête **`x-cron-secret: <CRON_SECRET>`**  
  (comportement exact défini dans `src/app/api/cron/daily-jobs/route.ts`.)

Exemples de planification :

- **Vercel** : Cron Job pointant vers `https://<votre-domaine>/api/cron/daily-jobs` en POST avec l’en-tête approprié (selon les possibilités de la plateforme ; sinon worker séparé ou GitHub Actions).
- **Render** : Cron Job HTTP avec méthode POST et en-têtes personnalisés.
- **GitHub Actions** `on: schedule` : étape `curl` avec `-X POST` et `-H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"`.

Utiliser une URL **HTTPS** et un secret **unique** et **rotatif** si compromis.

## 7. Vérification et supervision

- **Santé applicative** : `GET /api/health` — indique si MongoDB est joignable (`200` / `503`). À utiliser pour sonde load balancer / monitoring.
- **Logs** : consulter les logs de la plateforme (Vercel, Render, journal systemd, etc.) pour erreurs Prisma, SMTP, JWT.

## 8. E-mails (SMTP)

En production, renseigner un relais SMTP fiable (fournisseur transactionnel, messagerie d’entreprise). Vérifier SPF / DKIM / DMARC du domaine d’expédition pour limiter le classement en spam.

## 9. Sécurité — checklist courte

- [ ] HTTPS partout (certificat géré par l’hébergeur ou Let’s Encrypt).
- [ ] `JWT_SECRET` et `CRON_SECRET` forts et stockés comme **secrets** (pas en clair dans le dépôt).
- [ ] MongoDB : accès réseau restreint, utilisateur DB à privilèges minimaux.
- [ ] Pas de `ALLOW_SEED_ADMIN` / jeux de démo en production sauf opération contrôlée.
- [ ] Revoir périodiquement `npm audit` et les mises à jour Next.js / Prisma.

## 10. Première mise en ligne (ordre suggéré)

1. Créer le cluster MongoDB et la base.
2. Déployer l’app avec `DATABASE_URL` et `JWT_SECRET`.
3. Exécuter `prisma db push` (ou pipeline équivalent) pour appliquer le schéma.
4. Créer le premier compte administrateur (procédure interne : script `seed:admin` **uniquement** dans un contexte sécurisé, sans mot de passe par défaut en prod).
5. Configurer SMTP et tester réinitialisation mot de passe.
6. Configurer le cron avec `CRON_SECRET`.
7. Enregistrer la sonde sur `/api/health`.

---

*Document généré pour le dépôt LONACI ; à adapter aux politiques internes (DSI, juridique, localisation des données).*
