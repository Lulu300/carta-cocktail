---
id: E-24
title: "Import de cocktails : rafraîchir les listes et le badge de pénuries"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-05]
touches: [frontend/src/pages/admin/CocktailsPage.tsx, frontend/src/pages/admin/CocktailsPage.test.tsx]
sources: ["05-frontend-archi.md §4.2"]
branch:
pr:
---

## Contexte

E-05 (partie 2) retire l'invalidation transitoire de `AdminLayout` qui rechargeait les pénuries à chaque changement de page. Depuis, ce sont les mutations qui rafraîchissent les requêtes concernées : bouteilles, catégories, import de bouteilles. L'import de cocktails n'est pas encore passé sur TanStack Query.

## Problème constaté

- `CocktailsPage.tsx` : à la fermeture de `ImportCocktailWizard`, la page recharge seulement ses cocktails et leur disponibilité (`load(); loadAvailability();`).
- L'import peut pourtant créer des unités, des catégories, des bouteilles et des ingrédients. Les pages Catégories, Bouteilles, Ingrédients et Unités gardent leur cache jusqu'à 30 s. Le badge de pénuries de la barre latérale n'est rechargé qu'à la prochaine visite du tableau de bord ou de la page Pénuries.

## Ce qu'il faut faire

- Après un import (succès d'au moins une recette), invalider `qk.cocktails`, `qk.availability`, `qk.units`, `qk.categories`, `qk.categoryTypes`, `qk.bottles`, `qk.ingredients` et `qk.shortages`, avec `useInvalidateQueries()` de `queries/crud.ts`.
- Peut être fait dans E-06, qui migre `CocktailsPage` sur TanStack Query : dans ce cas, cocher les critères ici et passer la tâche à `done` dans la PR d'E-06.

## Critères d'acceptation

- [ ] Après un import de cocktail qui crée une catégorie et une bouteille, la page Catégories et le badge de pénuries sont à jour sans recharger la page.
- [ ] Couverture ≥ 80 % sur les lignes modifiées.

## Tests à ajouter ou adapter

- `CocktailsPage.test.tsx` : la fermeture de l'assistant d'import invalide les clés listées (espion sur `invalidateQueries`).

## Points d'attention

- Conflit de fichiers avec E-06 (`CocktailsPage.tsx`) : enchaîner, ou regrouper dans E-06.
- À faire avec E-06 ou juste après, avant la prochaine release.

## Journal

- 2026-10-11 : tâche créée par E-05 (partie 2), qui retire l'invalidation transitoire d'`AdminLayout`.
