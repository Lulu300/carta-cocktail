---
id: C-59
title: "Imports : garder tel quel le type existant choisi pour une catégorie créée"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-54]
touches: [backend/src/validation/bottleImport.ts, backend/src/validation/cocktailImport.ts, backend/src/routes/bottles.test.ts, backend/src/services/cocktail/cocktailImport.test.ts]
sources: []
branch:
pr:
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

- [ ] Un import qui crée une catégorie avec ` SPIRIT ` existant la range sous ` SPIRIT `, sans créer de type.
- [ ] Avec ` SPIRIT ` et `SPIRIT` existants, chaque catégorie va sous le type choisi.
- [ ] Le type au nom vide existant se choisit dans un import.
- [ ] Un type nouveau ` rum  x ` crée `rum x` ; un type blanc nouveau répond 400 sans rien créer.

## Tests à ajouter ou adapter

- `backend/src/routes/bottles.test.ts` et `backend/src/services/cocktail/cocktailImport.test.ts` : les cas ci-dessus.

## Points d'attention

- Étend aux imports la règle décidée par l'humain pour C-57 (« Category creation also keeps an EXISTING type exactly as picked »). C-57 avait gardé les imports hors périmètre : à confirmer avec l'humain avant de commencer.
- Le type lu dans un fichier de cocktail n'est pas trimé à l'aperçu (`ImportSourceDetail.type`) : un fichier exporté d'une instance qui a ` SPIRIT ` le propose tel quel.

## Journal

- 2026-11-24 : tâche créée pendant C-54 (hors périmètre).
