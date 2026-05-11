# Checklist pre-push production (Vercel)

Objectif: eviter les regressions entre local et production en validant la configuration critique avant chaque deploiement.

## 1) Variables d environnement (obligatoires)

Configurer dans Vercel (Project Settings > Environment Variables, scope `Production`) :

- [ ] `DATABASE_URL`
- [ ] `JWT_SECRET` (>= 32 caracteres, aleatoire)
- [ ] `CRON_SECRET`
- [ ] `NEXT_PUBLIC_APP_URL` (URL publique HTTPS)

## 2) Variables fortement recommandees

- [ ] `SMTP_HOST`
- [ ] `SMTP_PORT`
- [ ] `SMTP_USER`
- [ ] `SMTP_PASS`
- [ ] `EMAIL_FROM`
- [ ] `RATE_LIMIT_FAIL_CLOSED=true`
- [ ] `CORS_ALLOWED_ORIGINS` (si appels cross-site)
- [ ] `ENABLE_CSP_ENFORCE=true` (apres validation UI/CSP)

## 3) Valeurs a ne pas oublier

- [ ] `JWT_SECRET` n est pas une valeur de test/dev.
- [ ] `NEXT_PUBLIC_APP_URL` pointe bien vers le domaine de production.
- [ ] `CORS_ALLOWED_ORIGINS` contient les bons domaines (CSV, sans espace parasite).
- [ ] `CRON_SECRET` est identique entre Vercel env et la source qui appelle le cron.

## 4) Controle local avant push

Executer au minimum:

```bash
npm run build
```

Verifier qu aucune erreur bloquante n apparait et que les avertissements `env` sont compris/traites.

## 5) Post-deploiement (smoke tests)

Tester immediatement en production:

- [ ] `GET /api/health` -> `200`
- [ ] Connexion utilisateur (`/login`) OK
- [ ] `GET /api/auth/me` repond correctement en session
- [ ] Reinitialisation mot de passe (si SMTP actif)
- [ ] Route cron:
  - `POST /api/cron/daily-jobs`
  - Header `Authorization: Bearer <CRON_SECRET>` (ou `x-cron-secret`)
  - Reponse attendue: `200` (ou comportement metier attendu), jamais `503 CRON_SECRET non configure`

## 6) Regressions frequentes et causes

- `503` sur cron -> `CRON_SECRET` absent/mauvais en prod.
- E-mails non envoyes -> `SMTP_HOST` ou credentials SMTP manquants.
- Appels API bloques -> `CORS_ALLOWED_ORIGINS` incomplet.
- Comportement securite incoherent -> `RATE_LIMIT_FAIL_CLOSED` non defini a `true`.

## 7) Routine recommandee a chaque release

1. Verifier variables Vercel (Production).
2. Lancer `npm run build` localement.
3. Push/deployer.
4. Faire les smoke tests section 5.
5. Consulter les logs Vercel pendant 5-10 minutes.

---

Voir aussi:

- `docs/HEBERGEMENT.md`
- `docs/RISQUES.md`
- `.env.example`
