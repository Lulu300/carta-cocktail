---
id: F-14
title: "API documentée : spécification OpenAPI générée et documentation intégrée à l'application"
phase: F
lane: backend
criticite: basse
effort: L
status: done
owner: mixed
depends_on: [F-05]
touches: [backend/src/validation/, backend/src/routes/, backend/src/app.ts, backend/src/openapi/, backend/package.json, backend/package-lock.json, frontend/src/pages/admin/, frontend/src/App.tsx, frontend/src/i18n/locales/admin/, frontend/nginx.conf.template, frontend/security-headers.conf, README.md, docs/operations.md, .github/workflows/ci.yml, backend/src/middleware/rateLimit.ts, backend/src/services/cocktail/cocktailImage.ts, backend/src/test/, backend/AGENTS.md, frontend/src/components/, frontend/src/queries/, frontend/src/services/api.ts, frontend/src/test/msw/handlers.ts, frontend/package.json, frontend/package-lock.json, frontend/AGENTS.md, AGENTS.md, .github/scripts/bundle-budget.mjs, .github/scripts/bundle-budget.test.mjs, e2e/tests/]
sources: []
branch: feature/F-14-openapi
pr: 308
---

## Décisions validées (2026-11-27)

Demandée par l'humain le 2026-11-26 : « une API bien documentée pour tout le projet, avec une doc intégrée à l'application, disponible, propre, bien définie ». À faire après toutes les autres tâches du plan. Elle prépare F-15 (serveur MCP).

Décisions de l'humain du 2026-11-27 :

1. **Authentification.** Le bouton « Essayer » de la documentation utilise la session de l'admin connecté. Les jetons d'API sont dans F-16, menée en parallèle : pas de schéma de sécurité pour les jetons ici, F-16 l'ajoutera.
2. **Visibilité : option (c).**
   - Sans authentification, `/api/openapi.json` sert une spécification qui ne contient que les routes `/api/public/*`. Les routes publiques nécessaires à un client, comme `/api/auth/login` et `/api/health`, peuvent y figurer si c'est justifié.
   - L'admin connecté obtient la spécification complète.
   - La forme (même URL selon l'authentification, ou deux URL) est au choix de l'agent, justifiée. Aucun cache ne doit mélanger les deux versions : `Cache-Control`, `Vary`, service worker et nginx.

Choix faits dans la PR, dans ce cadre :

- **Deux URL.** `GET /api/openapi.json` (sans session) et `GET /api/openapi/full.json` (admin, 401 sans jeton). Chaque URL répond toujours le même document : aucun cache ne peut servir l'un à la place de l'autre, sans dépendre d'un `Vary: Authorization`, et une session expirée reçoit un 401 au lieu d'un document réduit. `Cache-Control: no-cache` pour le public (ETag), `private, no-store` pour le complet. Le service worker ne met en cache que `/api/public/` et jamais une requête avec `Authorization` ; nginx ne met rien en cache sous `/api/` : rien à changer de ce côté.
- **Document public** : les routes qu'un client appelle sans session, celles devant lesquelles ne passe pas `authMiddleware`, lu sur la route elle-même : `/api/public/*`, `/api/auth/login` (le moyen d'obtenir une session), `/api/health` (supervision) et `/api/openapi.json` lui-même. Les aperçus de liens de F-03 (`/api/public/share/…`, HTML pour les robots) sont exclus explicitement des deux documents.
- **Sans bibliothèque côté backend** : `z.toJSONSchema` de zod 4 (dialecte JSON Schema 2020-12, celui d'OpenAPI 3.1) suffit. Lecteur : Scalar (`@scalar/api-reference-react`, MIT), sans `eval`, avec thème sombre, traduction française et pré-remplissage du jeton. Swagger UI contient `new Function`/`eval` dans ses bundles et n'a pas de thème sombre ; Redoc n'a pas de bouton « Essayer ».

## Contexte

- Le backend expose environ 85 routes sous `/api` (`backend/src/routes/`, 38 fichiers).
- Chaque route valide déjà `params`, `query` et `body` avec un schéma zod (`backend/src/validation/`, middleware `validate()`). Les entrées sont donc décrites.
- Les sorties ne le sont pas encore. F-05 doit ajouter les schémas de sortie des routes publiques et des listes principales.
- Il n'existe aucune spécification OpenAPI et aucune page de documentation. Les clients d'API n'ont que les notes de release (« For clients that call the API directly… »).

## Problème constaté

- Un client externe (script, intégration, agent IA) doit lire le code pour savoir quelles routes existent, ce qu'elles prennent et ce qu'elles renvoient.
- Les changements d'API, comme les champs retirés par C-40 en v1.18.0, ne sont détectés par aucun outil.

## Ce qu'il faut faire

1. **Spécification générée, jamais écrite à la main.** Générer une spécification OpenAPI 3.1 à partir des schémas zod existants (entrées) et de ceux de F-05 (sorties) :
   - soit `z.toJSONSchema` de zod 4 avec un petit registre de routes ;
   - soit une bibliothèque éprouvée (`@asteasolutions/zod-to-openapi` ou équivalent compatible avec zod 4). Justifier le choix : licence, taille, audit.

   Chaque route déclare au même endroit :
   - sa méthode, son chemin, ses paramètres, son corps et ses réponses (2xx, et les erreurs typées 400, 401, 404, 409, 413, 429) ;
   - son résumé, sa description et son tag (Cocktails, Bottles, Menus, Imports, Backup…) ;
   - son besoin d'authentification.
2. **Format d'erreur unique décrit une fois** : le corps de `errorHandler` (`error`, `details`), les codes de validation, `Retry-After` du limiteur.
3. **Route de la spécification** (`GET /api/openapi.json`), selon la décision 2. Elle porte la version de l'app (`appVersion()` de C-23).
4. **Documentation intégrée** : une page « API » dans l'admin.
   - Elle rend la spécification avec un lecteur OpenAPI auto-hébergé, par exemple Scalar ou Redoc. Aucun CDN : la CSP n'est pas élargie.
   - Elle est chargée en différé : aucun impact sur le bundle public (140 kB).
   - Elle offre un bouton « Essayer » qui utilise la session courante.
   - Ses textes d'interface sont en i18n (en/fr). La spécification elle-même reste en anglais.
5. **Garde-fou en CI.** Un test échoue si une route Express n'est pas dans la spécification, ou si la spécification décrit une route qui n'existe plus. Un second test valide quelques réponses réelles contre leur schéma de sortie (repris de F-05).
6. **Documentation.**
   - Le README (section API) pointe vers la page et vers `/api/openapi.json`.
   - `docs/operations.md` explique comment créer un jeton et appeler l'API avec `curl`.
   - Les notes de release citent les changements d'API, détectés par un diff de la spécification entre deux tags. Ce diff est une option à évaluer.

## Critères d'acceptation

- [x] La spécification complète, servie à l'admin connecté, est une OpenAPI 3.1 valide (vérifiée par un validateur en CI). Elle couvre 100 % des routes `/api`, avec leurs entrées, leurs sorties et leurs erreurs. Ce qui est servi sans authentification à `/api/openapi.json` suit la décision 2 : rien (a), tout (b) ou les routes `/api/public/*` seulement (c). (86 routes décrites ; les 2 pages d'aperçu de F-03 exclues explicitement ; option (c) avec la connexion, la santé et le document lui-même.)
- [x] La page « API » de l'admin affiche la documentation, hors ligne, sans ressource externe. La CSP et le bundle public ne changent pas.
- [x] Une route ajoutée sans déclaration dans la spécification fait échouer la CI.

## Tests à ajouter ou adapter

- Couverture des routes : la liste des routes Express doit être égale à la liste des chemins de la spécification.
- Validation de la spécification (validateur OpenAPI 3.1).
- Contrats de réponse : au moins une route par fichier de routes.
- Frontend : la page API se charge en différé, est traduite, et affiche un état d'erreur.

## Points d'attention

- F-05 d'abord. Sans les schémas de sortie, la spécification ne décrirait que les entrées.
- Ne pas dupliquer les schémas : la spécification lit ceux de `validation/` et de F-05.
- Les routes de fichiers (photo, import, sauvegarde) se décrivent en `multipart/form-data` ou en flux binaire, avec leurs limites d'E-59.
- Les routes publiques des aperçus de F-03 (servies aux robots par nginx) sont hors `/api` : à documenter à part, ou à exclure explicitement.
- Pas de migration dans cette tâche : les jetons d'API (migration) sont dans F-16.

## Journal

- 2026-11-26 : tâche créée à la demande de l'humain (API documentée, doc intégrée), à faire après les autres tâches du plan. F-15 (serveur MCP compatible Code Mode) en dépend. 2026-11-26 : relecture de #289, jetons d'API sortis dans F-16 (tâche L trop large), critère 1 aligné sur la décision 2.
- 2026-11-27 : décisions de l'humain (voir « Décisions validées ») : « Essayer » avec la session de l'admin, sans schéma de sécurité pour les jetons (F-16) ; visibilité (c).
- 2026-11-27 : réalisée (branche `feature/F-14-openapi`, PR #308).
  - Backend : chaque route porte sa déclaration (`apiDocs()`, middleware sans effet, `src/openapi/routeDoc.ts`) ; le document lit le reste dans l'app telle qu'Express l'exécute (`collectApiRoutes()` : chemins, schémas de `validate()`, `authMiddleware`/`optionalAuth`, limiteurs). `mountApiRouter()` monte les routeurs (Express ne garde pas le chemin de montage). Schémas convertis par `z.toJSONSchema` de zod 4, composants nommés d'après les exports de `src/validation/` ; format d'erreur `ApiError` décrit une fois (`validation/errors.ts`, dont `ValidationIssue` devient le type de `validate.ts`). Fichiers en `multipart/form-data` avec leurs constantes de limite (`ACCEPTED_IMAGE_TYPES` exportée de `cocktailImage.ts`), sauvegarde et exports en flux binaire ou CSV.
  - Tests : couverture des routes (égalité routes Express = opérations + exclusions listées), validation OpenAPI 3.1 (`@seriousme/openapi-schema-validator`, devDependency, MIT), réponses réelles comparées à la déclaration de leur route pour au moins une route par fichier (`documentedResponses.test.ts`, échoue si un fichier de routes n'a aucune requête).
  - Frontend : page `/admin/api` (Scalar, chunk différé, jeton de session pour « Test Request », polices, agent IA, MCP et télémétrie de Scalar coupés), `bundle-budget.mjs` refuse `node_modules/@scalar/` dans le premier chargement et le precache (138,45 kB, inchangé), parcours E2E `api-docs.spec.ts` sous la CSP de nginx (aucune violation, aucune requête vers un autre site, requête de test à 200 avec la session).
  - Fichiers ajoutés à `touches` : `backend/src/middleware/rateLimit.ts`, `backend/src/services/cocktail/cocktailImage.ts`, `backend/src/test/`, `backend/AGENTS.md`, `frontend/src/components/`, `frontend/src/queries/`, `frontend/src/services/api.ts`, `frontend/src/test/msw/handlers.ts`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/AGENTS.md`, `AGENTS.md`, `.github/scripts/bundle-budget.mjs` (et son test), `e2e/tests/`. `frontend/nginx.conf.template`, `frontend/security-headers.conf` et `.github/workflows/ci.yml` n'ont pas eu à changer.
- 2026-11-27 : Notes de version : nouvelle page « API » dans l'admin : chaque route de l'API, ce qu'elle accepte et renvoie, avec un bouton pour l'essayer avec la session ouverte. Document OpenAPI 3.1 à `GET /api/openapi.json` (routes publiques, sans connexion) et `GET /api/openapi/full.json` (toutes les routes, admin connecté). Aucune action requise, pas de migration, `breaking: false`.
