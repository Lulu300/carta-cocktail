---
id: D-48
title: "Monter les routes de l'API pour que CodeQL voie le limiteur global (faux positifs js/missing-rate-limiting)"
phase: D
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/src/app.ts, backend/src/openapi/mounts.ts, backend/src/openapi/operations.ts, backend/src/openapi/openapi.test.ts]
sources: []
branch:
pr:
---

## Contexte

- Toutes les routes `/api` passent par le limiteur global `app.use('/api', apiLimiter)` de `backend/src/app.ts`. Les routes de sauvegarde ont en plus `backupLimiter`, et la connexion `loginLimiter`.
- Depuis F-14 (#308), les routeurs sont montés par `mountApiRouter(app, path, ...handlers)` (`backend/src/openapi/mounts.ts`). Cette fonction appelle `app.use(path, ...handlers)` puis retient le chemin de montage pour le document OpenAPI, car Express 5 ne garde pas ce chemin.
- CodeQL (configuration par défaut de GitHub) n'analyse que `main` et les PR vers `main`.

## Problème constaté

À la PR de release `develop` → `main` de v1.21.0 (#313), CodeQL a levé 9 alertes `js/missing-rate-limiting` (n° 36 à 44) sur des routes de `apiTokens.ts`, `auth.ts`, `backup.ts`, `public.ts` et `settings.ts`. Toutes passent pourtant par le limiteur global.

Explication probable : CodeQL ne suit plus la chaîne de middlewares quand le montage passe par une fonction qui étale un tableau dans `app.use`. Il ne voit alors plus le limiteur monté avant les routeurs. Les alertes ont été fermées comme faux positifs avec l'accord de l'humain (2026-11-27). Mais chaque nouvelle route montée de cette façon lèvera une nouvelle alerte à la prochaine PR vers `main`, et bloquera la release jusqu'à une nouvelle fermeture manuelle.

## Ce qu'il faut faire

1. **Reproduire en local** avec le CLI CodeQL : `codeql database create` sur `backend/`, puis la requête `js/missing-rate-limiting` du pack `codeql/javascript-queries`. Les alertes de #313 doivent réapparaître. Sinon, utiliser une PR brouillon vers `main`, fermée sans merge.
2. **Trouver la forme de montage que CodeQL comprend**, sans perdre ce dont F-14 a besoin (le chemin de montage de chaque routeur, lu par `collectApiRoutes()`). Pistes à comparer :
   - (a) Des appels `app.use(path, ...middlewares, router)` écrits en clair dans `app.ts`. Le chemin de montage est retenu à part, sans répéter les chemins à la main : par exemple, lu sur la pile d'Express après le montage, si c'est fiable sous Express 5.
   - (b) Garder `mountApiRouter`, mais avec des paramètres explicites (sans tableau étalé), si cela suffit à CodeQL.
   - (c) Un limiteur passé explicitement au montage de chaque routeur, si (a) et (b) échouent. Il ne doit pas compter deux fois la même requête (même instance que `apiLimiter`).

   Choisir la plus simple qui fait disparaître les alertes, sans duplication ni changement de comportement.
3. **Vérifier qu'aucun comportement ne change** : ordre des middlewares, limiteurs, 404 de l'API, CORS, document OpenAPI identique (comparer le JSON avant et après).
4. Noter dans le Journal la forme retenue, et la requête CodeQL qui le prouve.

## Critères d'acceptation

- [ ] La requête `js/missing-rate-limiting` ne lève plus d'alerte sur les routes de l'API montées dans `app.ts`. Le résultat de CodeQL avant et après est dans la PR.
- [ ] Les documents OpenAPI public et complet sont identiques avant et après.
- [ ] Les tests de limiteur et de couverture des routes passent sans changement d'attente.

## Tests à ajouter ou adapter

- `openapi.test.ts` : la couverture des routes et les chemins de montage restent justes.
- Les tests de limiteur existants (`apiRateLimit.test.ts`), inchangés.

## Points d'attention

- Hors périmètre : les autres alertes fermées à #313 (`js/path-injection` sur le chemin temporaire de multer, `js/insufficient-password-hash` sur le SHA-256 des jetons d'API, `js/bad-code-sanitization` dans un test du bac à sable) sont de vrais faux positifs, qui ne demandent pas de changement de code.
- Ne pas désactiver la requête CodeQL, et ne pas ajouter de configuration CodeQL au dépôt : la configuration par défaut est un réglage de l'humain.

## Journal

- 2026-11-27 : tâche créée à la demande de l'humain, après les 9 faux positifs `js/missing-rate-limiting` de la PR #313 (release v1.21.0), fermés avec son accord.
