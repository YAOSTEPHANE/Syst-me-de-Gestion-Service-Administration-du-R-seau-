# Guide d’utilisation — Infinitecore Systeme

Ce document est destiné aux **utilisateurs métier** (agents, responsables, supervision). Pour l’installation, l’hébergement ou la sécurité technique, voir [README.md](../README.md), [HEBERGEMENT.md](./HEBERGEMENT.md) et [RISQUES.md](./RISQUES.md). Une vue **direction / produit** est disponible dans [PRESENTATION-ENTREPRISE.md](./PRESENTATION-ENTREPRISE.md).

---

## 1. Accéder à l’application

- Ouvrez l’**URL** fournie par votre administrateur (ex. `https://…` en production, ou `http://localhost:3000` en test local).
- Utilisez un **navigateur récent** (Chrome, Edge, Firefox, Safari).
- L’interface est en **français**.

---

## 2. Connexion et session

### 2.1 Se connecter

1. Sur la page **Connexion** (`/login`), saisissez votre **identifiant** (souvent l’e-mail ou le compte défini par l’administrateur) et votre **mot de passe**.
2. Validez. En cas d’erreur, vérifiez la casse et l’absence de verrouillage de compte ; en cas de doute, contactez l’administrateur.

### 2.2 Mot de passe oublié

Si la fonction est activée et **l’e-mail configuré** côté serveur (SMTP), utilisez le flux **réinitialisation** depuis l’écran de connexion (demande de lien par e-mail, puis définition d’un nouveau mot de passe). Sinon, demandez une **réinitialisation manuelle** à l’administrateur.

### 2.3 Déconnexion

- Utilisez l’action **Déconnexion** dans l’interface (menu utilisateur / en-tête selon la version).
- Pour des **raisons de sécurité**, la session peut expirer après une **période d’inactivité** (environ **30 minutes** côté serveur, avec complément possible côté navigateur). Reconnectez-vous si l’application vous demande de vous identifier à nouveau.

### 2.4 Droits d’accès

Vous ne voyez que les **menus et actions** autorisés pour votre **rôle**, vos **agences**, vos **modules** et parfois vos **produits**. Si un écran manque, c’est en général une **restriction volontaire** : adressez-vous au référent applicatif.

**Rôles courants** (libellés métier) : Agent opérationnel, Chef(fe) de section (validation **N1**), Assistant(e) chef de service (**N2**), Chef(fe) de service (validation **finale** et paramètres étendus), Superviseur régional, Auditeur, Lecture seule. Détail dans [PRESENTATION-ENTREPRISE.md](./PRESENTATION-ENTREPRISE.md#4-gouvernance--rôles-et-responsabilités).

---

## 3. Prise en main de l’interface

### 3.1 Menu principal

La navigation latérale regroupe les modules par grandes zones :

| Section | Entrées (ordre courant) |
|---------|-------------------------|
| **Principal** | Tableau de bord, Concessionnaires, Contrats, Cautions, Intégrations PDV, Agréments, Attestations & domiciliation |
| **Opérations** | Cessions & Déloc., Résiliations, Décès & Succession, Bancarisation, GPR & Grattage, Registres |
| **Analyse** | Rapports, Toutes les alertes, Paramètres, Carte PDV |

Des **pastilles** (badges) sur certains liens signalent des **volumes à traiter** ou des **alertes** (contrats, cautions, intégrations PDV, agréments, successions, bancarisation, etc.).

### 3.2 Autres écrans utiles

- **Dossiers** (`/dossiers`) : suivi des **dossiers** liés au workflow contrats (souvent accessible depuis le **tableau de bord** ou le module **Contrats**). Validations **N1 / N2**, finalisation, éventuel **lien de signature**.
- **Import** (`/import`) : chargement de fichiers **JSON / CSV** pour alimenter ou mettre à jour des données (référentiels, concessionnaires, dossiers, etc.). **Réservé aux profils habilités** (typiquement **Chef de service** et périmètre **import / admin** défini par l’équipe).
- **Signature dossier** : si on vous envoie un **lien** (page publique avec **token**), ouvrez-le pour signer **sans** être connecté à Infinitecore Systeme (parcours dédié signataire externe).

### 3.3 En-tête

- **Notifications** (cloche) : messages ou rappels liés à votre activité.
- Filtre **agence** (selon profil) : restreint certaines vues au périmètre choisi.

---

## 4. Tableau de bord

Le **tableau de bord** résume l’activité : indicateurs (KPI), liens rapides vers les volumes importants (concessionnaires, dossiers, alertes, etc.). Utilisez-le comme **point d’entrée** quotidien.

---

## 5. Modules métier — usages typiques

Les écrans détaillent listes, filtres, formulaires et actions (création, modification, transitions de statut, pièces jointes, exports). Ci-dessous le **geste métier** principal par module.

| Module | Usage typique |
|--------|----------------|
| **Concessionnaires** | Consulter ou mettre à jour les **fiches PDV** (coordonnées, statuts, pièces, lien bancarisation). Import ou modèles selon les boutons disponibles. |
| **Contrats** | Piloter les **contrats** et le **workflow dossiers** ; repérer les dossiers à valider ; accéder aux **dossiers** et aux **exports**. |
| **Dossiers** | Faire avancer un dossier (**soumettre**, **valider N1 / N2**, **finaliser** ou **rejeter**) selon votre rôle ; générer un **lien de signature** si prévu. |
| **Cautions** | Suivre les cautions, décisions et **alertes** (ex. échéances sensibles). |
| **Intégrations PDV** | Finaliser ou suivre l’**intégration** des points de vente. |
| **Agréments** | Traiter les demandes d’**agrément** (workflow et files visibles dans l’interface). |
| **Attestations & domiciliation** | Gérer attestations et dossiers de **domiciliation**. |
| **Cessions & Déloc.** | Enregistrer et suivre les **cessions / délocalisations**. |
| **Résiliations** | Gérer les **sorties de contrat** et pièces associées. |
| **Décès & Succession** | Suivre les dossiers **succession** ; tenir compte des **alertes** de suivi. |
| **Bancarisation** | Créer ou valider les **demandes de bancarisation** liées aux PDV. |
| **GPR & Grattage** | Opérations **GPR** et **grattage** (saisie, validation, exports selon l’écran). |
| **Registres** | Consultation ou saisie des **registres** prévus par le processus. |
| **Rapports** | Consulter les **rapports** périodiques ; version **imprimable** si proposée (`/rapports/print`). |
| **Toutes les alertes** | Vue **transversale** des signaux (cautions, successions, PDV, etc.). |
| **Paramètres** | Options visibles selon le **rôle** (seuils, préférences, réglages applicatifs). |
| **Carte PDV** | **Cartographie** du réseau (géolocalisation des concessionnaires). |

*Les intitulés exacts des boutons peuvent évoluer ; en cas de doute sur une action sensible (validation, rejet, suppression), confirmez avec votre **chef de service**.*

---

## 6. Workflow des dossiers (rappel)

Schéma habituel : **Brouillon** → **Soumis** → **Validé N1** → **Validé N2** → **Finalisé** (ou **Rejeté** à une étape).

- **Agent** : saisie, soumission.
- **Chef de section** : contrôle **N1**.
- **Assistant CDS** : contrôle **N2**.
- **Chef de service** : **finalisation** et actions les plus étendues.

Seules les **transitions autorisées** pour votre profil sont proposées.

---

## 7. Import de données (`/import`)

1. Rendez-vous sur **`/import`** (adresse à conserver en favori si votre organisation ne place pas de lien visible dans le menu).
2. Choisissez le **module** et la **collection** cible (référentiels, concessionnaires, dossiers, cautions, agréments, registres, etc.).
3. Préparez un fichier **JSON** ou **CSV** conforme au format attendu (modèles ou documentation interne).
4. Mode **insert** (ajout) ou **upsert** (mise à jour selon clé métier) selon les options affichées.
5. Validez l’import. En cas d’erreur, l’interface ou les logs côté administrateur permettent le diagnostic.

Les imports massifs via **fichiers Excel** peuvent aussi exister **depuis certains modules** (concessionnaires, contrats, etc.) : respectez les **formats** et **tailles** indiqués à l’écran.

---

## 8. Exports

De nombreux écrans proposent **export Excel ou PDF** (listes filtrées, rapports). Utilisez les boutons **Exporter** ou liens de téléchargement ; les exports respectent en général le **filtre agence** et vos **droits**.

---

## 9. Bonnes pratiques

- **Ne partagez pas** votre mot de passe ; déconnectez-vous sur un poste **partagé**.
- **Vérifiez l’agence** sélectionnée avant une saisie ou un export sensible.
- En cas de **lenteur** ou d’**erreur répétée**, notez l’**heure**, l’**écran** et l’**action** : cela aide le support technique.
- Les **données** traitées peuvent être personnelles ou confidentielles : respectez la **politique interne** de votre organisation (RGPD, secret professionnel, etc.).

---

## 10. Obtenir de l’aide

- **Compte, mot de passe, droits** : référent **RH / IT** ou **administrateur applicatif** Infinitecore Systeme.
- **Règles métier** (qui valide quoi, champs obligatoires) : **Chef de service** ou **documentation métier** interne.
- **Incident technique** (panne, bug) : **support DSI** avec la **référence** éventuelle affichée (ex. en-tête de réponse `X-Request-Id` pour le diagnostic côté serveur — mention utile si votre support vous la demande).

---

*Document aligné sur la structure des écrans et du menu (`src/components/lonaci/lonaci-nav.tsx`). En cas d’écart après une mise à jour logicielle, privilégier la version en ligne de l’application.*
