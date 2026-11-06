---
id: E-35
title: "Admin : un seul point de déclaration des suppressions dans useCrudMutations"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-15]
touches: [frontend/src/queries/crud.ts, frontend/src/queries/crud.test.tsx, frontend/src/components/admin/useForcedDelete.tsx, frontend/src/pages/admin/BottlesPage.tsx, frontend/src/pages/admin/CategoriesPage.tsx, frontend/src/pages/admin/IngredientsPage.tsx, frontend/src/pages/admin/MenusPage.tsx]
sources: ["05-frontend-archi.md §H2"]
branch:
pr:
---

## Contexte

E-15 (PR #148) a sorti la suppression des bouteilles, catégories et ingrédients de `useCrudMutations` pour la confier au hook `useForcedDelete` (`components/admin/useForcedDelete.tsx`), qui gère le 409 et la suppression forcée. La relecture de la PR #148 a relevé deux restes de ce découpage, acceptables dans la PR mais à nettoyer ensuite (remarque non bloquante 2).

## Problème constaté

Constaté sur `develop` après le merge de B-19 (c770de0), branche d'E-15 rebasée :

- `BottlesPage.tsx:43-47`, `CategoriesPage.tsx:33-37` et `IngredientsPage.tsx:75-79` passent encore `messages.deleted` à `useCrudMutations` (`queries/crud.ts:89`, champ obligatoire), alors qu'ils n'utilisent plus le `remove` qu'il construit (`crud.ts:119-122`). La même clé est passée une seconde fois à `useForcedDelete` (`deletedMessage`).
- Ces trois pages reconstruisent à la main la liste `[key, ...invalidates]` que `useCrudMutations` calcule déjà (`crud.ts:105`) : `[qk.bottles, ...BOTTLE_DEPENDENT_KEYS]`, `[qk.categories, ...refreshedKeys]`, `REFRESHED_KEYS`. Une page peut donc rafraîchir après une suppression d'autres requêtes qu'après une création, sans que rien ne le signale.
- `MenusPage.tsx:52-55` passe de même `messages.updated` sans utiliser `update`.

## Ce qu'il faut faire

1. Choisir une forme et l'appliquer aux quatre pages, par exemple :
   - `useCrudMutations` accepte une option `forcedDelete: true` et renvoie alors `remove` construit avec `useForcedDelete`, en lui passant `[key, ...invalidates]` et `messages.deleted` ;
   - ou `useCrudMutations` expose la liste des requêtes rafraîchies, et les messages des mutations non utilisées deviennent facultatifs.
2. Garder les invalidations actuelles de chaque page à l'identique (les tests d'E-15 les vérifient).

## Critères d'acceptation

- [ ] Aucune page ne déclare un message ou une liste de requêtes pour une mutation qu'elle n'utilise pas.
- [ ] La liste des requêtes rafraîchies après une suppression n'est écrite qu'une fois par page.
- [ ] Les requêtes rafraîchies par chaque suppression restent les mêmes qu'après E-15.

## Tests à ajouter ou adapter

- `crud.test.tsx` : la nouvelle option ou la nouvelle valeur renvoyée.
- Les tests de suppression de `BottlesPage`, `CategoriesPage` et `IngredientsPage` doivent passer sans changement d'assertion.

## Points d'attention

- Ne pas réintroduire de `remove` qui contourne la boîte de suppression forcée pour les bouteilles, les catégories et les ingrédients.
- Les unités et les cartes gardent la suppression simple de `useCrudMutations` (pas de forçage, décision du 2026-10-08).

## Journal

- 2026-11-05 : tâche créée lors de la correction de la PR #148 (E-15), remarque non bloquante 2 de la relecture.
