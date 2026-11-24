---
id: C-54
title: "Types à espaces ou au nom vide : les marquer aussi hors de Manage Types"
phase: C
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-53]
touches: [frontend/src/pages/admin/CategoriesPage.tsx, frontend/src/pages/admin/ShortagesPage.tsx, frontend/src/components/admin/bottles/BottleFormModal.tsx, frontend/src/components/import/CategoryTypeSelect.tsx, frontend/src/components/admin/categories/useCategoryTypeName.ts]
sources: []
branch:
pr:
---

## Contexte

Trouvé pendant C-53. C-53 marque les noms de type que le HTML cacherait (` SPIRIT ` affiché comme `SPIRIT`, nom vide affiché comme rien) dans Categories > Manage Types et dans la liste des types du formulaire de catégorie, avec `useCategoryTypeName` (`components/admin/categories/useCategoryTypeName.ts`). Les autres écrans qui affichent un type de catégorie ne passent pas par ce hook.

## Problème constaté

Ces écrans affichent `localize(categoryType)` ou `category.type` tel quel :

- `CategoriesPage.tsx` : le badge de type de la table (`typeLabel`). Une catégorie de type ` SPIRIT ` a le même badge qu'une catégorie de type `SPIRIT`, une catégorie de type `''` un badge vide.
- `ShortagesPage.tsx` : le badge de type de chaque manque.
- `BottleFormModal.tsx` : la liste des catégories (`Vodka (SPIRIT)`).
- `import/CategoryTypeSelect.tsx` : la liste des types de l'assistant d'import de bouteilles.

## Ce qu'il faut faire

Utiliser `typeLabel` de `useCategoryTypeName` dans ces quatre écrans (le déplacer dans `hooks/` s'il sert hors de `components/admin/categories/`, en gardant ses messages dans le bundle admin : ces écrans sont tous dans l'admin).

## Critères d'acceptation

- [ ] Dans ces quatre écrans, ` SPIRIT ` et `SPIRIT` se distinguent, et le nom vide a le libellé traduit.
- [ ] Les noms normaux s'affichent comme avant.

## Tests à ajouter ou adapter

- Les tests de chaque page ou composant : un type ` SPIRIT ` à côté de `SPIRIT`, un type au nom vide.

## Points d'attention

- Seules les données antérieures à v1.9.0 sont concernées : la création trime et refuse un nom vide.

## Journal

- 2026-11-24 : tâche créée pendant C-53 (hors périmètre).
