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
touches: [backend/src/app.ts, backend/src/openapi/mounts.ts, backend/src/openapi/operations.ts, backend/src/middleware/rateLimit.ts, backend/src/openapi/openapi.test.ts]
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

La cause n'est pas encore prouvée. F-14 a changé deux choses que CodeQL peut ne plus suivre :

- **Le montage.** `app.use(path, ...)`, écrit en clair dans `app.ts` jusqu'à v1.20.0, passe maintenant par `mountApiRouter`, qui étale un tableau dans `app.use`.
- **Le limiteur.** `createRateLimiter()` (`backend/src/middleware/rateLimit.ts`) renvoyait directement `rateLimit({…})` d'`express-rate-limit`. Il range maintenant l'instance dans un ensemble (`limiters.add(limiter)`) avant de la renvoyer, pour que le document OpenAPI décrive les limites.

Les alertes 41 et 42 (`backup.ts`) pèsent pour la seconde cause, ou pour les deux. `/api/backup` reçoit pourtant `backupLimiter` en paramètre explicite de son montage : `mountApiRouter(app, '/api/backup', authMiddleware, backupLimiter, backupRoutes)`. Une troisième explication reste possible. CodeQL ne signale que le code modifié par la PR, et la taille de #313 a pu faire ressortir des alertes que des montages plus anciens auraient déjà levées : « Alerts not introduced by this pull request might have been detected because the code changes were too large ». Les alertes ont été fermées comme faux positifs avec l'accord de l'humain (2026-11-27). Mais chaque nouvelle route montée de cette façon lèvera une nouvelle alerte à la prochaine PR vers `main`, et bloquera la release jusqu'à une nouvelle fermeture manuelle.

## Ce qu'il faut faire

1. **Reproduire en local** avec le CLI CodeQL : `codeql database create` sur `backend/`, puis la requête `js/missing-rate-limiting` du pack `codeql/javascript-queries`.
   - Les alertes de #313 doivent réapparaître sur `develop`. Sinon, utiliser une PR brouillon vers `main`, fermée sans merge.
   - Lancer la même requête sur `v1.20.0`, pour savoir si ces routes y étaient déjà signalées. Si oui, la cause est la troisième explication, et la tâche se réduit à trouver une forme que CodeQL reconnaît.
2. **Isoler la cause par des essais séparés**, chacun relancé avec la requête :
   - (a) `createRateLimiter()` renvoie l'appel `rateLimit({…})` directement, et l'enregistrement pour le document OpenAPI se fait autrement : par exemple par une fonction appelée sur le résultat, ou par une lecture de la pile d'Express.
   - (b) Des appels `app.use(path, ...middlewares, router)` écrits en clair dans `app.ts`. Le chemin de montage, lu par `collectApiRoutes()`, est retenu sans répéter les chemins à la main : par exemple lu sur la pile d'Express après le montage, si c'est fiable sous Express 5. Ou bien `mountApiRouter` garde des paramètres explicites, sans tableau étalé.
   - (a) et (b) ensemble, si aucun ne suffit seul.
3. **Retenir la forme la plus simple** qui fait disparaître les alertes, sans duplication ni changement de comportement, et garder ce dont F-14 a besoin. Si aucune forme ne suffit, l'écrire dans le Journal avec les essais faits, et rendre la tâche à l'humain : la fermeture manuelle des faux positifs reste alors la règle.
4. **Vérifier qu'aucun comportement ne change** : ordre des middlewares, limiteurs, 404 de l'API, CORS, document OpenAPI identique (comparer le JSON avant et après).
5. Noter dans le Journal la cause trouvée, la forme retenue, et la requête CodeQL qui le prouve.

## Critères d'acceptation

- [ ] La requête `js/missing-rate-limiting` ne lève plus d'alerte sur les routes de l'API montées dans `app.ts`. La PR contient sa sortie avant et après : la requête locale du CLI CodeQL, ou les alertes d'une PR brouillon vers `main`.
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
