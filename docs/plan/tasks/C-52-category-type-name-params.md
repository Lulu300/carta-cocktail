---
id: C-52
title: "Types de catégorie à espaces ou au nom vide : éditer et supprimer le bon type"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-17]
touches: [backend/src/validation/categoryTypes.ts, backend/src/validation/categories.ts, backend/src/routes/categoryTypes.ts, backend/src/routes/categoryTypes.test.ts, backend/src/routes/categories.test.ts, frontend/src/services/api.ts, frontend/src/services/api.test.ts, frontend/src/test/msw/handlers.ts, frontend/src/pages/admin/CategoriesPage.test.tsx]
sources: []
branch: fix/C-52-category-type-name-params
pr:
---

## Contexte

Relecture des notes de v1.15.0 (PR #205, « User-visible gaps » 1). Avant la validation zod de v1.9.0, des types de catégorie pouvaient porter un nom entouré d'espaces (` SPIRIT ` à côté de `SPIRIT`) ou un nom vide : le seed les créait à chaque démarrage, et la migration de C-17 (#202) les crée sur une sauvegarde ancienne restaurée. Les notes de v1.15.0 renvoient l'admin vers Categories > Manage Types pour éditer ces types.

## Décisions validées

- 2026-11-24, humain : « Code fix before the rc » — « Small backend task (author + reviewer): the type name in the URL is no longer trimmed, so these types can be edited and deleted correctly; test; the notes then say nothing special. »
- 2026-11-24, humain, type au nom vide : « Address it in the API » — « Small API change in C-52: the type name can also be passed as a query (`?name=`) or a route without segment, with services/api.ts adapted. A new URL form. »
- 2026-11-24, humain, enregistrement d'une catégorie de type ` SPIRIT ` : « Stop trimming on edit » — « Only the category UPDATE keeps the type as sent (5 lines + tests). Creation keeps trimming; the form and the CSV/cocktail imports are unchanged. Side effect: an API client sending ' rum ' on edit would create a ' rum ' type (the form never does). »

## Problème constaté

Vérifié par une sonde sur `origin/develop` (85242ef), depuis v1.9.0 (`f57cf4e`) :

- `CategoryTypeParams` utilise `RequiredText` (`z.string().trim().min(1)`). `PUT /api/category-types/%20SPIRIT%20` agit sur `SPIRIT` : la couleur et les traductions de `SPIRIT` sont écrasées (le formulaire part des traductions de ` SPIRIT `, souvent vides). `DELETE` du même chemin supprime `SPIRIT` s'il est libre, ou répond 409 s'il est utilisé.
- `PUT` et `DELETE /api/category-types/` (nom vide) répondent 404 : aucune route ne correspond à un segment vide.
- `CategoryUpdate.type` est trimé et le formulaire envoie toujours le type : tout enregistrement d'une catégorie de type ` SPIRIT ` la déplace sur `SPIRIT`.

Le frontend envoie déjà le nom tel qu'il est stocké (`useCategoryTypeForm` passe `editing.name`, `services/api.ts` l'encode avec `encodeURIComponent`).

## Ce qu'il faut faire

1. `CategoryTypeParams` : `z.string().min(1)`, sans trim.
2. Forme `?name=` : `PUT /api/category-types?name=` et `DELETE /api/category-types?name=`, schéma `CategoryTypeQuery` (`z.string()`, nom vide accepté seulement là). Les routes `/:name` restent. `services/api.ts` passe par la query pour le nom vide seulement.
3. `CategoryUpdate.type` : `z.string().min(1)`, sans trim. `CategoryCreate` garde le trim.

## Critères d'acceptation

- [x] Éditer ou supprimer ` SPIRIT ` agit sur ` SPIRIT ` ; `SPIRIT` (couleur, traductions, catégories) reste intact.
- [x] `SPIRIT` s'édite et se supprime comme avant.
- [x] Le type au nom vide s'édite et se supprime depuis Manage Types (`?name=`), avec le 409 habituel s'il est utilisé.
- [x] Sans `name` ou avec deux `name`, la forme query répond 400 et ne touche rien.
- [x] Enregistrer une catégorie de type ` SPIRIT ` la laisse sur ` SPIRIT ` ; la création d'une catégorie trime toujours le type.

## Tests à ajouter ou adapter

- `backend/src/routes/categoryTypes.test.ts` : ` SPIRIT ` à côté de `SPIRIT` (édition, suppression, 409, 404), forme `?name=` (nom vide édité et supprimé, 409, nom non trimé, 404, 400 sans nom ou avec deux noms).
- `backend/src/routes/categories.test.ts` : édition qui garde ` SPIRIT `, 400 pour un type vide, création qui trime.
- `frontend/src/services/api.test.ts` : nom à espaces encodé dans le chemin, nom vide dans la query.
- `frontend/src/pages/admin/CategoriesPage.test.tsx` : édition et suppression du type au nom vide depuis Manage Types, enregistrement d'une catégorie de type ` SPIRIT `.

## Points d'attention

- Choix de `?name=` plutôt qu'une route sans segment : `DELETE /api/category-types` sans rien d'autre ressemblerait à « tout supprimer » ; avec la query, le nom est explicite et son absence répond 400.
- Effet de bord accepté par l'humain : un client de l'API qui envoie ` rum ` à l'édition d'une catégorie crée un type ` rum ` (le formulaire ne le fait jamais).
- Hors périmètre, tâche C-53 : la fenêtre Manage Types affiche ` SPIRIT ` exactement comme `SPIRIT` et le type vide comme une ligne vide.

## Journal

- 2026-11-24 : tâche créée d'après la relecture de la PR #205. Faits sondés avant correctif ; décisions humaines ci-dessus.
