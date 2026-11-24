---
id: C-59
title: "Imports : garder tel quel le type existant choisi pour une catégorie créée"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-54]
touches: [backend/src/validation/bottleImport.ts, backend/src/validation/cocktailImport.ts, backend/src/validation/categories.ts, backend/src/services/categoryTypeService.ts, backend/src/routes/bottles.ts, backend/src/services/cocktail/cocktailImport.ts, backend/src/routes/bottles.test.ts, backend/src/routes/cocktails.test.ts, backend/src/services/cocktail/cocktailImport.test.ts, docs/plan/tasks/C-57-category-create-existing-type.md]
sources: []
branch: fix/C-59-imports-keep-chosen-type
pr: https://github.com/Lulu300/carta-cocktail/pull/216
---

## Contexte

Trouvé pendant C-54. Depuis C-57, la création et l'édition d'une catégorie gardent tel quel le type existant choisi (` SPIRIT `, `X  Y`) : `ensureCategoryType` cherche d'abord le nom exact, et ne réduit qu'un nom nouveau. C-57 a laissé les imports inchangés. Depuis C-54, la liste des types des deux assistants d'import (`CategoryTypeSelect`) distingue ` SPIRIT ` de `SPIRIT` et nomme le type au nom vide : l'admin peut donc choisir l'un d'eux en sachant lequel il prend.

## Problème constaté

Sur `origin/develop` (570193e) :

- Import de bouteilles, résolution `create` d'une catégorie : `CategoryResolution.data.type` est `RequiredText.default('SPIRIT')` (`backend/src/validation/bottleImport.ts`), donc trimé avant `ensureCategoryType`.
- Import de cocktails : `CategoryData.type` est aussi `RequiredText.default('SPIRIT')` (`backend/src/validation/cocktailImport.ts`).
- Conséquence : l'admin choisit ` SPIRIT ` dans l'assistant, la catégorie va sous `SPIRIT` s'il existe, sinon un type `SPIRIT` gris est créé à côté de ` SPIRIT `. Choisir le type au nom vide fait répondre 400 à la confirmation.

## Ce qu'il faut faire

1. Les deux schémas : le type d'une catégorie à créer n'est plus trimé (`z.string()`, défaut `SPIRIT` gardé), comme `CategoryCreate.type` depuis C-57. `ensureCategoryType` applique la règle : correspondance exacte d'abord, sinon nom réduit, rattaché ou créé ; un nouveau type blanc répond 400.
2. Vérifier le détail du 400 d'un type blanc dans un import (`blankTypeError` nomme `body.type`, qui ne correspond pas au chemin d'une résolution d'import).

## Critères d'acceptation

- [x] Un import qui crée une catégorie avec ` SPIRIT ` existant la range sous ` SPIRIT `, sans créer de type.
- [x] Avec ` SPIRIT ` et `SPIRIT` existants, chaque catégorie va sous le type choisi.
- [x] Le type au nom vide répond 400 dans un import, même s'il existe, comme à la création et à l'édition d'une catégorie (critère initial « se choisit dans un import » remplacé, voir le Journal).
- [x] Un type nouveau ` rum  x ` crée `rum x` ; un type blanc nouveau répond 400 sans rien créer, avec le détail de la résolution d'import.

## Tests à ajouter ou adapter

- `backend/src/routes/bottles.test.ts` et `backend/src/services/cocktail/cocktailImport.test.ts` : les cas ci-dessus.

## Points d'attention

- Étend aux imports la règle décidée par l'humain pour C-57 (« Category creation also keeps an EXISTING type exactly as picked »). C-57 avait gardé les imports hors périmètre : à confirmer avec l'humain avant de commencer.
- Le type lu dans un fichier de cocktail n'est pas trimé à l'aperçu (`ImportSourceDetail.type`) : un fichier exporté d'une instance qui a ` SPIRIT ` le propose tel quel.

## Journal

- 2026-11-24 : tâche créée pendant C-54 (hors périmètre).
- 2026-11-24 : PR #216 (branche `fix/C-59-imports-keep-chosen-type`). Les deux schémas d'import prennent le type d'une catégorie à créer avec `CategoryTypeName` (`validation/categories.ts`, exporté), le schéma de la création et de l'édition d'une catégorie, plus le défaut `SPIRIT` : une seule règle, aucune logique nouvelle. `ensureCategoryType` (C-55) garde un type existant tel quel et réduit un type nouveau. Il reçoit maintenant le chemin du type dans la requête (`typePath`, défaut `body.type` des routes de catégorie) : le 400 d'un type blanc nouveau dans un import nomme `body.resolutions.categories.<clé>.data.type`, comme les autres erreurs de validation de l'import (point 2). Faits établis avant de coder :
  - Valeur du fichier ou type choisi dans la liste : le backend ne peut pas les distinguer, les deux arrivent dans `data.type`, et la règle de C-57 s'applique à la valeur reçue (correspondance exacte, sinon nom réduit). Le fichier de cocktail garde ses espaces jusque-là (`ImportSourceDetail.type`) : un fichier exporté d'une instance qui a ` SPIRIT ` va sous ` SPIRIT ` s'il existe à la cible, sinon sous `SPIRIT`. Le fichier de bouteilles est réduit dès la lecture (`toText` trime chaque cellule CSV et chaque texte JSON, comme les autres colonnes) : ` SPIRIT ` y est proposé comme `SPIRIT`, et l'admin peut choisir ` SPIRIT ` dans la liste. Les espaces internes d'un fichier de bouteilles (`X  Y`) restent, et suivent la même règle.
  - Type au nom vide : adressable depuis l'assistant (la liste le propose, sous « (no name) », depuis C-54). Un type vide dans un fichier ne l'est pas : les deux assistants et l'aperçu le remplacent par `SPIRIT`. Le critère « se choisit dans un import » contredisait les règles validées : le formulaire de catégorie refuse ce type avec `categories.typeRequired` (décision de l'humain pour C-53, message au lieu d'un enregistrement muet) et `CategoryCreate` / `CategoryUpdate` répondent 400 (critère de C-57). La même règle s'applique donc aux imports : 400 à la confirmation, comme avant cette PR, avec le chemin exact. Signaler ce choix dans les assistants avant la confirmation : C-62 (frontend, hors périmètre).
  - Tests : bouteilles (route) et cocktails (service) : ` RUM ` / ` AGAVE ` existant seul, ` SPIRIT ` et `SPIRIT` existants, nouveau type à espaces réduit en gris, type blanc nouveau refusé avec son chemin ; nom vide refusé (route de bouteilles et route de cocktails), type au nom vide existant compris. Sondes de sabotage (chaque schéma trimé, chaque schéma sans `min(1)`, chaque appelant sans chemin, `blankTypeError` sur `body.type`) : chacune fait échouer au moins un test.
- Notes de version : « Importing bottles or a cocktail that creates a category files it under the existing type picked in the wizard, spaces included, as creating a category by hand does. »
- 2026-11-24 : relecture de #216 (approuvée). Décision du coordinateur, conforme à C-53/C-57 : le type au nom vide est refusé dans les imports (400), comme dans le formulaire de catégorie (C-53) et à la création et l'édition (C-57) ; le critère 3 réécrit est retenu. Effet relevé par la relecture, cohérent avec la même règle : un ancien type fait seulement d'espaces (`'   '`) se choisit désormais dans les deux imports (201 au lieu de 400), comme à la création et à l'édition, puisque `CategoryTypeName` ne refuse que `''`. Nits appliqués : commentaire du test de `bottles.test.ts` corrigé (le nom vide est refusé même s'il existe, un type blanc seulement s'il est nouveau) ; chemin du type dans une résolution d'import partagé par `importedCategoryTypePath` (`validation/categories.ts`), utilisé par `bottles.ts` et `cocktailImport.ts` ; Journal de C-57 complété (point 3 remplacé par C-59, `touches` complété). Rebasée sur `origin/develop` (B-22, #215). Conflit attendu avec C-56 (#218) dans `categoryTypeService.ts` : la PR mergée en second garde `typePath` dans `requireNewCategoryTypeName`.
