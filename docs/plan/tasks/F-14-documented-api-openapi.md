---
id: F-14
title: "API documentée : spécification OpenAPI générée et documentation intégrée à l'application"
phase: F
lane: backend
criticite: basse
effort: L
status: todo
owner: mixed
depends_on: [F-05]
touches: [backend/src/validation/, backend/src/routes/, backend/src/app.ts, backend/src/openapi/, backend/package.json, backend/package-lock.json, frontend/src/pages/admin/, frontend/src/App.tsx, frontend/src/i18n/locales/admin/, frontend/nginx.conf.template, frontend/security-headers.conf, README.md, docs/operations.md, .github/workflows/ci.yml]
sources: []
branch:
pr:
---

## Décisions à valider avant de commencer

Demandée par l'humain le 2026-11-26 : « une API bien documentée pour tout le projet, avec une doc intégrée à l'application, disponible, propre, bien définie ». À faire après toutes les autres tâches du plan. Elle prépare F-15 (serveur MCP).

Choix à faire par l'humain (`owner: mixed`) :

1. **Authentification.** Les jetons d'API (pour les scripts et le MCP) sont traités à part, dans F-16. Ici, le bouton « Essayer » de la documentation utilise la session de l'admin connecté.
2. **Visibilité de la documentation.** Ce choix fixe le périmètre du premier critère d'acceptation.
   - (a) Réservée à l'admin connecté : la page vit dans l'admin.
   - (b) Spécification publique à `/api/openapi.json`, pages admin incluses, mais sans données.
   - (c) Spécification publique pour les routes `/api/public/*` seulement, spécification complète pour l'admin connecté.

   Recommandation : (c).

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

- [ ] La spécification complète, servie à l'admin connecté, est une OpenAPI 3.1 valide (vérifiée par un validateur en CI). Elle couvre 100 % des routes `/api`, avec leurs entrées, leurs sorties et leurs erreurs. Ce qui est servi sans authentification à `/api/openapi.json` suit la décision 2 : rien (a), tout (b) ou les routes `/api/public/*` seulement (c).
- [ ] La page « API » de l'admin affiche la documentation, hors ligne, sans ressource externe. La CSP et le bundle public ne changent pas.
- [ ] Une route ajoutée sans déclaration dans la spécification fait échouer la CI.

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
