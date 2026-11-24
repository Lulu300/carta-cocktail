---
id: C-57
title: "Création d'une catégorie : garder tel quel le type existant choisi"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-55]
touches: [backend/src/validation/categories.ts, backend/src/services/categoryTypeService.ts, backend/src/routes/categories.test.ts, frontend/src/pages/admin/CategoriesPage.test.tsx, docs/plan/tasks/C-52-category-type-name-params.md]
sources: []
branch: fix/C-57-category-create-existing-type
pr: https://github.com/Lulu300/carta-cocktail/pull/209
---

## Contexte

Relecture des notes de v1.15.0 (PR #205, « User-visible gaps » 1). C-52 (#206) garde tel quel le type envoyé à l'édition d'une catégorie ; C-55 (#208) a partagé `newCategoryTypeName` et `ensureCategoryType` (correspondance exacte avec un type existant d'abord, sinon nom réduit puis créé en gris). La création d'une catégorie trimait encore le type avant `ensureCategoryType`.

## Décisions validées

- 2026-11-24, humain : « Code fix before the rc » — « Category creation also keeps an EXISTING type exactly as picked (as edit does since C-52); only a brand-new typed type is trimmed and tidied. Changes the C-52 rule 'Creation keeps trimming'; small backend task + review. »

## Problème constaté

Sur `origin/develop` (18d90ca) :

- `CategoryCreate.type` est `RequiredText` (`z.string().trim().min(1)`). Créer une catégorie en choisissant un ancien type ` RUM ` alors qu'aucun `RUM` n'existe envoie ` RUM ` ; le schéma le réduit à `RUM`, `ensureCategoryType` ne trouve pas `RUM` et le crée en gris, sans traductions. Manage Types montre une nouvelle ligne `RUM` à côté de ` RUM `, et la catégorie prend un badge gris au lieu de la couleur de ` RUM `.
- Si `RUM` existe aussi, la catégorie va sous `RUM` au lieu du ` RUM ` choisi.
- Le frontend envoie déjà le type choisi tel qu'il est stocké (`toCategoryInput` : `form.type` tel quel, la valeur de l'option est le nom stocké) ; seul un type personnalisé saisi est trimé et mis en majuscules.

## Ce qu'il faut faire

1. `CategoryCreate.type` : `z.string().min(1)`, sans trim, comme `CategoryUpdate.type`. Un seul schéma partagé (`CategoryUpdate = CategoryCreate.partial()`).
2. `ensureCategoryType` reste la seule règle : correspondance exacte d'abord, sinon nom réduit par `newCategoryTypeName`, puis rattaché ou créé. Un nouveau type blanc répond 400 avec le détail `body.type`, comme à l'édition.
3. Imports CSV et de cocktails inchangés (leurs schémas triment toujours).

## Critères d'acceptation

- [x] Créer une catégorie avec ` RUM ` existant seul la range sous ` RUM `, sans créer de type.
- [x] Avec ` RUM ` et `RUM` existants, chaque catégorie va sous le type choisi ; aucun des deux ne change.
- [x] Un type nouveau ` rum  x ` crée `rum x`, en gris.
- [x] Un type blanc répond 400 (détail `body.type`) et ne crée ni catégorie ni type ; un type vide répond 400.
- [x] L'édition, les imports et `POST /api/category-types` ne changent pas.

## Tests à ajouter ou adapter

- `backend/src/routes/categories.test.ts` : le test « création qui trime » de C-52 est remplacé par : ` RUM ` existant seul, ` RUM ` et `RUM` existants, nouveau ` rum  x `, type blanc (400, rien créé), type vide (400).
- `frontend/src/pages/admin/CategoriesPage.test.tsx` : création avec ` SPIRIT ` choisi dans la liste (envoyé tel quel), type personnalisé saisi avec des espaces (trimé et en majuscules).

## Points d'attention

- Effet de bord, comme à l'édition depuis C-52 : un client de l'API qui envoie ` rum ` à la création est rattaché à ` rum ` si ce type existe, sinon crée `rum`.

## Journal

- 2026-11-24 : tâche créée d'après la relecture de la PR #205 et la décision de l'humain ci-dessus.
- 2026-11-24 : PR #209 (branche `fix/C-57-category-create-existing-type`). `CategoryCreate.type` non trimé ; `CategoryUpdate = CategoryCreate.partial()`, un seul schéma pour la création et l'édition ; aucune nouvelle logique, `ensureCategoryType` (C-55) applique la règle. Frontend inchangé (le type choisi part tel qu'il est stocké, un type saisi est trimé par `toCategoryInput`), verrouillé par deux tests. Journal de C-52 complété : règle « Creation keeps trimming » remplacée. Sondes de sabotage (création trimée, garde du nom blanc, réduction, correspondance exacte, type choisi trimé côté frontend, type saisi non trimé) : chacune fait échouer au moins un test. Pas de ligne « Notes de version » : un type existant est gardé à la création comme à l'édition, rien ne reste à signaler ; la ligne « Notes de version » de C-52 ne s'applique plus.
- 2026-11-24 : point 3 « Imports CSV et de cocktails inchangés » remplacé par C-59 (PR #216) : les deux imports prennent le type d'une catégorie à créer avec `CategoryTypeName`, comme la création et l'édition, et gardent donc tel quel le type existant choisi.
