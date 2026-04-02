# LONACI — Documentation pour présentation entreprise

Document de support pour une **démonstration ou un comité de direction** : synthèse métier, périmètre fonctionnel, gouvernance des accès et repères techniques. Contenu aligné sur l’application telle qu’implémentée dans le dépôt (Next.js, modules listés ci-dessous).

---

## 1. Résumé exécutif (elevator pitch)

**LONACI** est une **application web métier** dédiée au **pilotage du réseau de concessionnaires (PDV)**, à la **gestion du cycle de vie des contrats** et aux **processus associés** (cautions, bancarisation, agréments, successions, etc.). Elle centralise les données, **enchaîne les validations à plusieurs niveaux** (N1 / N2 / finalisation) et offre un **tableau de bord analytique** (KPI, tendances par agence, alertes opérationnelles).

**Valeur pour l’entreprise**

- **Traçabilité** : qui a créé, validé ou rejeté un dossier ; historique des statuts.
- **Cohérence** : même référentiel concessionnaires / contrats pour toutes les agences.
- **Pilotage** : indicateurs consolidés, alertes (cautions J+10, successions en retard, PDV non finalisés, etc.).
- **Séparation des rôles** : droits calibrés par fonction (agent, chef de section, assistant CDS, chef de service, supervision, audit, lecture seule).

---

## 2. Contexte métier (à adapter à l’oral)

L’application couvre un **écosystème de distribution** (points de vente / concessionnaires) rattachés à des **agences**, avec des **produits** et des **flux documentaires** (dossiers, pièces jointes, demandes de bancarisation). Les workflows incluent notamment :

- Souscription et suivi de **contrats** (y compris actualisation).
- Gestion des **cautions** et suivi des échéances sensibles.
- Parcours **bancarisation** (demandes, validation, statuts).
- Cas **cession / délocalisation**, **résiliation**, **décès et succession**.
- **Agréments**, **attestations et domiciliation**, **GPR & grattage**, **registres**.
- **Cartographie** des PDV (géolocalisation).

*À personnaliser lors de la présentation* : positionnement exact par rapport à la politique produit de l’organisme (LONACI, partenaires, réglementation locale).

---

## 3. Périmètre fonctionnel (modules de l’application)

| Zone | Module | Rôle principal |
|------|--------|----------------|
| **Principal** | Tableau de bord | Vue synthétique, KPI, liens vers les volumes et alertes. |
| | Concessionnaires | Fiche PDV, statuts, pièces, bancarisation liée, périmètre agence. |
| | Contrats | Gestion des contrats et dossiers associés ; badge « dossiers à valider ». |
| | Cautions | Suivi des cautions ; alertes (ex. J+10 pour profils habilités). |
| | Intégrations PDV | Finalisation / intégration des points de vente ; badge volumes ouverts. |
| | Agréments | Workflow agréments ; files d’attente visibles sur le nav. |
| | Attestations & domiciliation | Documents et domiciliation. |
| **Opérations** | Cessions & déloc. | Transferts / délocalisations. |
| | Résiliations | Sorties de contrat. |
| | Décès & Succession | Dossiers succession ; alertes « stale » pour contrôle hiérarchique. |
| | Bancarisation | Demandes et validation ; indicateurs agrégés. |
| | GPR & Grattage | Module opérationnel dédié. |
| | Registres | Registres légaux ou opérationnels. |
| **Analyse** | Rapports | Rapports périodiques (dont versions imprimables). |
| | Toutes les alertes | Regroupement des signaux. |
| | Paramètres | Configuration (profils autorisés selon rôle). |
| | Carte PDV | Visualisation géographique du réseau. |

---

## 4. Gouvernance : rôles et responsabilités

Les **profils** suivants sont définis dans l’application (libellés métier) :

| Rôle technique | Libellé métier | Mission résumée |
|----------------|----------------|-----------------|
| `AGENT` | Agent opérationnel | Saisie des dossiers ; périmètre agence et **modules assignés**. |
| `CHEF_SECTION` | Chef(fe) de section | **Contrôle N1** : valide ou rejette ; rapports hebdomadaires. |
| `ASSIST_CDS` | Assistant(e) chef de service | **Contrôle N2** ; rapports mensuels / semestriels / annuels. |
| `CHEF_SERVICE` | Chef(fe) de service | **Validation finale** ; accès large ; paramétrage système. |
| `SUPERVISEUR_REGIONAL` | Superviseur régional | Supervision **inter-agences** selon périmètre. |
| `AUDITEUR` | Auditeur | **Lecture globale** pour conformité. |
| `LECTURE_SEULE` | Lecture seule | Consultation sans action. |

**Filtres complémentaires** (utilisateur) : agence(s) autorisées, **modules** autorisés, **produits** autorisés — permettant un **RBAC fin** au-delà du seul rôle.

**Workflow dossiers** (statuts types) : brouillon → soumis → validé N1 → validé N2 → finalisé (ou rejeté).

---

## 5. Sécurité et session (points à mettre en avant)

- **Authentification** : mots de passe hashés (**bcrypt**), session portée par **cookie HTTP-only** signé (**JWT** via `jose`, algorithme **HS256**).
- **Durée du jeton** : expiration JWT côté serveur **8 heures** après émission ; en complément, **invalidation métier** si l’identifiant de session en base ne correspond plus au cookie (déconnexion forcée, autre appareil).
- **Cookie** : attributs `SameSite=Lax`, `Secure` en production, chemin applicatif contrôlé.
- **API** : la plupart des handlers appellent **`requireApiAuth`** : vérification JWT, utilisateur actif, **session serveur** (`currentSessionId`), **inactivité 30 minutes** (basée sur `lastActivityAt` en base), puis **rôles**, **agence**, **modules** et **produits** autorisés selon le profil.
- **Déconnexion automatique (UX)** : après **30 minutes d’inactivité** côté navigateur (clavier / souris / défilement), l’UI peut fermer la session — complémentaire au contrôle serveur.
- **Réinitialisation mot de passe** : champs en base (`resetPasswordTokenHash`, `resetPasswordExpiresAt`) et routes API dédiées sous `/api/auth/reset-password`.
- **Chemins API publics** (sans session cookie) : santé (`/api/health`), **login** / **logout**, **reset password**, **cron** quotidien (secret dédié), liens de **signature** dossier par token — référence centralisée dans `src/proxy.ts` (base pour un futur middleware Edge si besoin).

*À préciser avec l’équipe infra* : hébergement, sauvegardes MongoDB, politique de secrets (`DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`), et éventuelle **homologation** interne.

---

## 6. Architecture technique (vue CTO / DSI)

### 6.1 Stack résumée

| Couche | Choix |
|--------|--------|
| **Framework** | **Next.js** 16 (App Router), **React** 19 |
| **Langage** | **TypeScript** (strict) |
| **UI** | **Tailwind CSS** 4, **Chart.js** / **react-chartjs-2** (graphiques) |
| **Données** | **MongoDB** + **Prisma** (client typé, schéma `prisma/schema.prisma`) |
| **Accès Mongo natif** | Driver **`mongodb`** pour collections hors modèles Prisma (logs, index métier, exécutions de cron, etc.) |
| **Validation** | **Zod** sur les entrées des routes API |
| **Courriel** | **Nodemailer** (SMTP), activable selon paramètres applicatifs |
| **Documents** | **PDF** (pdfkit, pdf.js pour la lecture), **Excel** (xlsx) |
| **Cartes** | **Leaflet** |

### 6.2 Organisation du code (`src/`)

- **`src/app/`** — **App Router** : pages publiques (`login`, racine), zone métier sous le groupe de routes **`(lonaci)`** (dashboard, concessionnaires, contrats, dossiers, cautions, bancarisation, successions, rapports, carte PDV, paramètres, etc.), page **signature** dossier par token.
- **`src/app/api/`** — **Route Handlers** REST : un dossier par domaine (`concessionnaires`, `dossiers`, `contrats`, `cautions`, `bancarisation`, `succession-cases`, `admin`, `auth`, `cron`, …) avec `route.ts` (GET/POST/PATCH selon les cas).
- **`src/components/lonaci/`** — UI métier (navigation shell, panneaux par module, rapports, admin).
- **`src/lib/auth/`** — JWT, cookie de session, lecture session depuis la requête, **guards** API (`requireApiAuth`).
- **`src/lib/lonaci/`** — règles métier, constantes (rôles, modules), rapports, alertes, utilisateurs.
- **`src/lib/env.ts`** — résolution centralisée des variables d’environnement (JWT, Mongo, timeouts).
- **`prisma/schema.prisma`** — modèles persistés principaux ; **`scripts/`** — graines et import.

### 6.3 Modèle de données (Prisma / MongoDB)

Collections modélisées côté Prisma (extraits représentatifs) :

- **`User`** — compte, rôle, agences / modules / produits autorisés, session courante, activité, reset password.
- **`Concessionnaire`** — PDV, statuts, bancarisation, pièces jointes (JSON), GPS, index pour filtres et carte.
- **`Contrat`** — référence unique, lien concessionnaire / produit, statut, `dossierId`.
- **`BancarisationRequest`** — demandes et validation.
- **`Counter`** — séquences (références métier).

D’autres flux (dossiers, successions, cautions, etc.) s’appuient sur des documents Mongo gérés via le driver natif et/ou des agrégations, en cohérence avec les routes API du même nom.

### 6.4 Contrats API (patterns)

- Entrées validées avec **Zod** ; réponses JSON structurées ; codes **401** (non authentifié), **403** (accès refusé, module / agence / produit), **404**, **503** si configuration manquante (ex. cron sans `CRON_SECRET`).
- **`requireApiAuth`** mappe l’URL vers une **clé de module** (ex. `CONTRATS`, `SUCCESSION`, `DASHBOARD`) pour appliquer `modulesAutorises` lorsque la liste utilisateur n’est pas vide.
- Export et impressions : endpoints dédiés (`export`, `reports`, PDF côté serveur ou client selon l’écran).

### 6.5 Tâches planifiées (cron)

- **Route** : `POST /api/cron/daily-jobs`.
- **Autorisation** : en-tête `Authorization: Bearer <CRON_SECRET>` **ou** `x-cron-secret: <CRON_SECRET>` (sans `CRON_SECRET` configuré, la route répond **503**).
- **Effets typiques** : garantie d’index métier, **synthèse quotidienne** des dossiers, alertes **successions « stale »**, **cautions J+10**, enregistrement d’une trace dans une collection Mongo (`report_cron_runs`), envoi d’e-mails d’alerte si SMTP et paramètres applicatifs l’autorisent.

### 6.6 Qualité et build

- **Lint** : ESLint 9 + `eslint-config-next`.
- **Build** : `next build` ; pas de script `test` dans `package.json` à ce jour — la stratégie de tests (e2e, unitaires) est à définir selon la gouvernance projet.

**Scripts utiles** : `prisma:generate`, `prisma:push`, `seed:admin` / `seed:demo` / `seed:test`, `import:data`.

### 6.7 Détail des éléments d’architecture

Cette sous-section **explique le rôle de chaque brique** évoquée en 6.1 à 6.6 (et renvoie à la **§5** pour la sécurité et à la **§7** pour le déploiement).

#### 6.7.1 Stack résumée (§6.1) — rôle de chaque couche

| Élément | Rôle dans l’architecture |
|--------|---------------------------|
| **Next.js 16 (App Router)** | Cadre web : routage par fichiers, rendu serveur / client, API intégrées. L’App Router structure la navigation et les layouts. |
| **React 19** | Bibliothèque UI : composants, état, rendu de l’interface. |
| **TypeScript (strict)** | Typage statique pour limiter les erreurs et documenter les contrats de données dans tout le code. |
| **Tailwind CSS 4** | Styles utilitaires (classes) pour l’UI sans feuilles CSS monolithiques. |
| **Chart.js / react-chartjs-2** | Graphiques (KPI, tendances) dans le tableau de bord et les écrans analytiques. |
| **MongoDB + Prisma** | Base documentaire ; Prisma fournit un client typé et un schéma (`schema.prisma`) pour les modèles principaux. |
| **Driver `mongodb`** | Accès direct aux collections hors Prisma (logs, index métier, exécutions de cron, agrégations spécifiques). |
| **Zod** | Validation des entrées des routes API (forme et types des payloads). |
| **Nodemailer** | Envoi d’e-mails via SMTP (alertes, notifications), selon la configuration. |
| **PDF (pdfkit, pdf.js)** | Génération / lecture de PDF (dossiers, rapports). |
| **xlsx** | Import / export Excel. |
| **Leaflet** | Carte interactive des PDV (géolocalisation). |

#### 6.7.2 Organisation du code `src/` (§6.2)

| Dossier / fichier | Rôle |
|-------------------|------|
| **`src/app/`** | Pages et layouts App Router : login, accueil, zone métier sous le groupe **`(lonaci)`** (écrans métier), page de signature par token. |
| **`src/app/api/`** | **Route Handlers** HTTP : arborescence par domaine métier avec `route.ts` (GET/POST/PATCH…). Couche **API REST** de l’application. |
| **`src/components/lonaci/`** | Composants React métier : shell de navigation, écrans par module, rapports, admin. |
| **`src/lib/auth/`** | Authentification : JWT, cookie de session, lecture de la session depuis la requête, **`requireApiAuth`** (garde d’accès API). |
| **`src/lib/lonaci/`** | Logique métier partagée : rôles, modules, rapports, alertes, utilisateurs. |
| **`src/lib/env.ts`** | Point unique pour les variables d’environnement (JWT, Mongo, timeouts). |
| **`prisma/schema.prisma`** | Schéma des modèles persistés gérés par Prisma. |
| **`scripts/`** | Données initiales (seed) et imports. |

#### 6.7.3 Modèle de données (§6.3)

| Modèle / zone | Rôle |
|---------------|------|
| **`User`** | Compte : rôle, agences / modules / produits autorisés, session courante, dernière activité, champs reset mot de passe. |
| **`Concessionnaire`** | Point de vente : statuts, bancarisation, pièces (souvent JSON), coordonnées GPS, index pour filtres et carte. |
| **`Contrat`** | Contrat lié PDV / produit, statut, lien vers un dossier (`dossierId`), référence unique. |
| **`BancarisationRequest`** | Demandes de bancarisation et leur cycle de validation. |
| **`Counter`** | Séquences pour numéros / références métier. |
| **Autres flux (Mongo natif)** | Dossiers, successions, cautions, etc. : documents et agrégations via le driver Mongo, en cohérence avec les routes du même nom. |

#### 6.7.4 Contrats API (§6.4)

- **Zod** à l’entrée pour garantir des payloads attendus.
- Réponses **JSON** structurées et codes HTTP explicites : **401** (non identifié), **403** (pas le droit module / agence / produit), **404**, **503** (ex. cron sans secret).
- **`requireApiAuth`** : après authentification, associe l’URL à une **clé de module** (`CONTRATS`, `SUCCESSION`, etc.) pour appliquer `modulesAutorises` lorsque l’utilisateur a une liste de modules restreinte.
- **Exports / impressions** : endpoints dédiés (export, rapports, PDF selon l’écran).

#### 6.7.5 Tâches planifiées — cron (§6.5)

| Élément | Rôle |
|--------|------|
| **`POST /api/cron/daily-jobs`** | Point d’entrée unique pour les jobs quotidiens. |
| **Auth cron** | `Authorization: Bearer <CRON_SECRET>` ou `x-cron-secret` — sans `CRON_SECRET` configuré → **503**. |
| **Effets** | Index métier, synthèse quotidienne des dossiers, alertes successions « stale », cautions J+10, trace dans **`report_cron_runs`**, e-mails si SMTP activé. |

#### 6.7.6 Qualité et build (§6.6)

- **ESLint 9** + config Next : cohérence de style et règles React/Next.
- **`next build`** : build de production ; absence de script `test` documenté — stratégie de tests à définir.
- **Scripts** : génération Prisma, push schéma, seeds, import de données.

#### 6.7.7 Sécurité (lien avec la §5)

Les mécanismes **bcrypt**, **cookie HTTP-only + JWT (jose, HS256)**, double contrôle d’expiration (JWT ~8 h + session en base), attributs du cookie, **`requireApiAuth`** (dont inactivité **30 min** via `lastActivityAt`), et chemins publics centralisés sont détaillés en **§5 Sécurité et session**.

#### 6.7.8 Déploiement (lien avec la §7)

Les variables d’environnement (**`JWT_SECRET`**, **`CRON_SECRET`**, Mongo, SMTP, **`NEXT_PUBLIC_APP_NAME`**) et la checklist opérationnelle (build, lint, planification du cron, sonde **`GET /api/health`**) sont détaillés en **§7 Déploiement et exploitation**.

#### 6.7.9 Synthèse

**Next/React** pour l’UI et le routage ; **API Routes** pour le backend ; **Prisma + MongoDB** pour la persistance structurée ; **driver Mongo** pour le reste ; **auth JWT + session serveur** pour la sécurité ; **Zod** pour les entrées ; **cron HTTP sécurisé** pour les batchs ; **PDF, Excel, cartes** pour les besoins métiers.

---

## 7. Déploiement et exploitation

### 7.1 Variables d’environnement (référence)

| Variable | Rôle |
|----------|------|
| **`JWT_SECRET`** | Obligatoire ; **≥ 32 caractères** en production ; ne doit pas être la valeur de dev par défaut. |
| **`DATABASE_URL`** | Chaîne MongoDB pour **Prisma** (souvent enrichie côté code pour paramètres driver). |
| **`MONGODB_URI`** | Optionnel ; sinon réutilisation de `DATABASE_URL` pour le client Mongo **natif**. |
| **`MONGODB_DB`** | Nom de base si absent de l’URL. |
| **`MONGODB_CONNECT_TIMEOUT_MS`** / **`MONGODB_SERVER_SELECTION_TIMEOUT_MS`** | Optionnels (défaut 30 s) — utiles sur Atlas ou réseaux lents. |
| **`CRON_SECRET`** | Secret pour appeler `/api/cron/daily-jobs`. |
| **`SMTP_HOST`**, **`SMTP_PORT`**, **`SMTP_USER`**, **`SMTP_PASS`** | Envoi mail (Nodemailer). |
| **`EMAIL_FROM`** ou **`SMTP_USER`** | Adresse expéditeur. |
| **`NEXT_PUBLIC_APP_NAME`** | Libellé affiché (défaut « LONACI »). |

En **développement**, des valeurs par défaut locales peuvent s’appliquer pour JWT et Mongo (avec avertissement console) — **jamais en production**.

### 7.2 Checklist opérationnelle

1. Définir `JWT_SECRET`, `DATABASE_URL` (et `CRON_SECRET` si cron utilisé).
2. Build : `npm run build` ; démarrage : `npm run start`.
3. Développement local : `npm run dev` (Turbopack).
4. Qualité : `npm run lint`.
5. Planifier l’appel HTTP sécurisé vers **`POST /api/cron/daily-jobs`** (Bearer ou en-tête `x-cron-secret`), fréquence métier.
6. Endpoint **`GET /api/health`** pour sonde de disponibilité.

---

## 8. Proposition de plan de diaporama (12–15 slides)

1. **Titre** — LONACI, version / contexte projet.  
2. **Enjeux** — dispersion des données, délais de validation, risque opérationnel.  
3. **Réponse apportée** — plateforme unique, workflow N1/N2, pilotage.  
4. **Personas** — agent, chef de section, CDS, supervision, audit.  
5. **Capture** — tableau de bord (KPI).  
6. **Capture** — fiche concessionnaire + carte PDV.  
7. **Parcours** — cycle contrat / dossier (schéma simple).  
8. **Modules** — une slide « grille » (tableau section 3).  
9. **Alertes** — cautions, succession, bancarisation (exemples métier).  
10. **Rapports** — périodicité, export PDF / données.  
11. **Sécurité** — session, rôles, inactivité (sans jargon inutile).  
12. **Technique** — stack une ligne + hébergement cible.  
13. **Roadmap** — prochaines évolutions (à compléter par la direction produit).  
14. **Q&R**.

---

## 9. Messages clés à retenir pour la clôture

- **Une seule plateforme** pour le réseau, les validations et le reporting.  
- **Gouvernance claire** : rôles métiers + restrictions agence / module / produit.  
- **Architecture moderne** et maintenable (Next.js, TypeScript, MongoDB, Prisma).  
- **Prêt pour la montée en charge** sous réserve de bonnes pratiques d’hébergement et de sauvegarde.

---

*Document généré à partir du code du dépôt `lonaci` — à actualiser si de nouveaux modules ou règles métiers sont ajoutés.*
