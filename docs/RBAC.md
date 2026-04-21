# RBAC - Guide d'implementation

Ce document decrit la couche RBAC appliquee aux routes API et la methode standard pour proteger les endpoints critiques.

## 1) Source de verite

- Matrice des permissions: `src/lib/auth/rbac.ts` (`RBAC_MATRIX`)
- Garde d'authentification globale: `src/lib/auth/guards.ts` (`requireApiAuth`)
- Middleware RBAC explicite: `src/lib/auth/checkPermission.ts`

## 2) Middleware standard

Utiliser `checkPermission()` pour toute route critique:

- transitions de workflow
- validations finales
- rejets et retours en correction
- endpoints d'export sensibles

Exemple:

```ts
const auth = await checkPermission(request, {
  roles: ["CHEF_SECTION", "ASSIST_CDS", "CHEF_SERVICE"],
  resource: "DOSSIERS",
  action: "VALIDATE_N1",
});
if ("error" in auth) return auth.error;
```

## 3) Mapping des actions metier -> RBAC

Utiliser `resolveRbacAction()` pour mapper les statuts/metiers vers les actions RBAC:

- `VALIDATE_N1`
- `VALIDATE_N2`
- `FINALIZE`
- `REJECT`
- `RETURN_FOR_CORRECTION`
- fallback recommande: `UPDATE`

## 4) Routes critiques couvertes (explicit RBAC)

- `src/app/api/dossiers/[id]/transition/route.ts`
- `src/app/api/cautions/[id]/decision/route.ts`
- `src/app/api/cautions/[id]/finalize/route.ts`
- `src/app/api/agrements/[id]/transition/route.ts`
- `src/app/api/pdv-integrations/[id]/transition/route.ts`
- `src/app/api/resiliations/[id]/transition/route.ts`
- `src/app/api/gpr-registrations/[id]/transition/route.ts`
- `src/app/api/cessions/[id]/transition/route.ts`
- `src/app/api/attestations-domiciliation/[id]/transition/route.ts`
- `src/app/api/succession-cases/[id]/advance/route.ts`
- `src/app/api/scratch-codes/lots/[id]/transition/route.ts`
- `src/app/api/bancarisation/[id]/validate/route.ts`

## 5) Tests

Test unitaire middleware:

- `src/lib/auth/__tests__/permissions.test.ts`

Objectifs verifies:

- `checkPermission()` transmet correctement roles + contexte + bloc `rbac` a `requireApiAuth()`
- `resolveRbacAction()` applique le mapping et le fallback

## 6) Regle projet

Nouvelle route critique = RBAC explicite obligatoire:

1. parser la demande
2. deduire l'action RBAC
3. appeler `checkPermission()`
4. executer la logique metier

