---
id: C-55
title: "Types de catégorie : réduire les espaces internes à la création, distinguer les noms existants"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-53]
touches: [backend/src/services/categoryTypeService.ts, backend/src/services/categoryTypeService.test.ts, backend/src/routes/categoryTypes.ts, backend/src/routes/categoryTypes.test.ts, backend/src/routes/categories.ts, backend/src/routes/categories.test.ts, backend/src/routes/bottles.ts, backend/src/routes/bottles.test.ts, backend/src/services/cocktail/cocktailImport.ts, backend/src/services/cocktail/cocktailImport.test.ts, backend/src/validation/categories.ts, frontend/src/components/admin/categories/useCategoryTypeName.ts, frontend/src/pages/admin/CategoriesPage.test.tsx]
sources: []
branch: fix/C-55-category-type-inner-spaces
pr: 208
---

## Contexte

Relecture de #207 (C-53), « User-visible effects » 1. Le HTML réduit aussi les espaces internes : deux types `X  Y` et `X Y` s'affichent pareil dans Categories > Manage Types et dans la liste des types du formulaire de catégorie. `isHiddenByHtml` (C-53) ne regardait que les extrémités du nom. Contrairement aux espaces autour, ce cas pouvait encore être créé : `POST /api/category-types` avec `x  y` créait `X  Y` à côté de `X Y`, de même qu'un type personnalisé saisi dans le formulaire de catégorie.

## Décisions validées

- 2026-11-24, humain : « Fix before the rc » — « One more small task (author + reviewer) before the rc: creation collapses inner spaces, and existing ones are shown distinctly. »

## Problème constaté

Chemins qui créent un type, sur `origin/develop` (038ee31) :

- `POST /api/category-types` : `RequiredText` (trim), puis majuscules. `x  y` donne `X  Y`.
- `POST /api/categories` : `CategoryCreate.type` trimé, puis `ensureCategoryType` (upsert sur le nom exact).
- `PUT /api/categories/:id` : `CategoryUpdate.type` non trimé depuis C-52, puis `ensureCategoryType`. Un type nouveau `' rum '` ou `'   '` était créé tel quel.
- Import de bouteilles (`POST /api/bottles/import/confirm`, résolution `create`) et import de cocktails (`confirmImport`, résolution `create`) : type trimé par le schéma, puis `ensureCategoryType`.
- Seed : noms fixes (`SPIRIT`, `SYRUP`, `SOFT`). Migration de C-17 : crée les types des catégories existantes tels quels (données existantes). Restauration d'une sauvegarde : fichier de base entier. Aucun de ces trois ne crée de nom saisi.

## Ce qu'il faut faire

1. `categoryTypeService.ts` : `newCategoryTypeName(name)` (trim, puis chaque suite d'espaces internes réduite à un espace) et `ensureCategoryType` qui renvoie le nom du type retenu : un nom qui correspond exactement à un type existant garde ce type tel quel ; sinon le nom est réduit, puis rattaché au type de ce nom ou créé. Un nom vide après réduction répond 400.
2. Les routes et services qui créent une catégorie (création, édition, import de bouteilles, import de cocktails) enregistrent le nom renvoyé par `ensureCategoryType`. `POST /api/category-types` passe par `newCategoryTypeName`.
3. `useCategoryTypeName` (C-53) : `isHiddenByHtml` et `visibleName` marquent aussi les suites de 2 espaces ou plus et tout blanc autre qu'un espace (tabulation, saut de ligne), avec `␣` et « (with spaces) » / « (avec espaces) ».

## Critères d'acceptation

- [x] `POST /api/category-types` avec `x  y` crée `X Y`, ou répond 409 si `X Y` existe.
- [x] Un type nouveau donné à la création ou à l'édition d'une catégorie, ou par un import, est trimé et ses espaces internes réduits.
- [x] Un type existant choisi tel quel (`X  Y`, ` SPIRIT `) n'est jamais modifié ni dédoublé.
- [x] `X  Y` et `X Y` se distinguent dans Manage Types et dans la liste des types du formulaire, lecteur d'écran compris, aussi avec la même traduction.
- [x] Les noms normaux s'affichent comme avant.

## Tests à ajouter ou adapter

- `backend/src/services/categoryTypeService.test.ts` (nouveau) : réduction du nom, type existant gardé tel quel (espaces internes ou autour), création réduite en gris, rattachement à `X Y` existant, nom blanc refusé.
- `backend/src/routes/categoryTypes.test.ts` : création réduite, 409 face à `X Y`, création de `X Y` à côté d'un `X  Y` ancien.
- `backend/src/routes/categories.test.ts` : création réduite, `X  Y` existant gardé à la création et à l'édition, type nouveau trimé et réduit à l'édition, type blanc refusé à l'édition.
- `backend/src/routes/bottles.test.ts`, `backend/src/services/cocktail/cocktailImport.test.ts` : type créé par l'import, réduit.
- `frontend/src/pages/admin/CategoriesPage.test.tsx` : liste des types (espaces internes, tabulation, traduction identique, nom accessible) et lignes de Manage Types.

## Points d'attention

- Un import ou un client de l'API qui donne `X  Y` alors que seul `X Y` existe est rattaché à `X Y` : la règle de création ne permet pas de créer `X  Y`. C'est le même comportement que le trim pour ` SPIRIT ` à côté de `SPIRIT`.
- Effet de bord de C-52 levé : l'édition d'une catégorie avec un type nouveau ` rum ` crée `rum`, et un type blanc nouveau répond 400 au lieu de créer `'   '`.
- Les autres écrans qui affichent un type (badge de la table, manques, formulaire de bouteille, import) : C-54, qui réutilise `useCategoryTypeName` et profite donc de ce marquage.

## Journal

- 2026-11-24 : tâche créée d'après la relecture de #207 et la décision de l'humain.
- 2026-11-24 : PR #208 (branche `fix/C-55-category-type-inner-spaces`). `newCategoryTypeName` et `ensureCategoryType` partagés par les cinq chemins de création ; `visibleName` marque les espaces internes. Sondes de sabotage (réduction, correspondance exacte, garde du nom blanc, route de création de type, chacun des quatre appelants, les deux motifs d'affichage) : chacune fait échouer au moins un test. Pas de changement d'`api.ts` ni des libellés. Pas de ligne « Notes de version » : la création range un nom saisi avec des espaces répétés sous sa forme à un espace, et les noms anciens sont marqués comme ceux de C-53, sans action de l'utilisateur.
