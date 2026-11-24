---
id: C-53
title: "Manage Types : distinguer un type à espaces ou au nom vide"
phase: C
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-52]
touches: [frontend/src/components/admin/categories/CategoryTypesManager.tsx, frontend/src/components/admin/categories/CategoryFormModal.tsx, frontend/src/pages/admin/CategoriesPage.test.tsx]
sources: []
branch:
pr:
---

## Contexte

Trouvé pendant C-52. Des données antérieures à v1.9.0 peuvent contenir un type de catégorie ` SPIRIT ` (espaces autour) à côté de `SPIRIT`, ou un type au nom vide. Depuis C-52, l'API édite et supprime le bon type, mais l'admin doit encore savoir lequel il choisit.

## Problème constaté

- Dans Categories > Manage Types, le HTML réduit les espaces : ` SPIRIT ` s'affiche exactement comme `SPIRIT`. L'admin ne sait pas laquelle des deux lignes il édite ou supprime.
- Le type au nom vide s'affiche comme une ligne vide : il ne reste que la pastille de couleur et le nombre de catégories.
- Même chose dans la liste des types du formulaire de catégorie (`CategoryFormModal`).

## Ce qu'il faut faire

À décider avec l'humain : par exemple garder les espaces visibles (`white-space: pre` ou nom entre guillemets quand il n'est pas trimé) et un libellé traduit pour le nom vide (« (sans nom) » / « (no name) »).

## Critères d'acceptation

- [ ] ` SPIRIT ` et `SPIRIT` se distinguent dans Manage Types et dans le formulaire de catégorie.
- [ ] Le type au nom vide a un libellé lisible, traduit en en/fr.

## Tests à ajouter ou adapter

- `CategoriesPage.test.tsx` : les deux types se distinguent, libellé du nom vide.

## Points d'attention

- Seuls les noms stockés avant v1.9.0 sont concernés : la création trime et refuse un nom vide.

## Journal

- 2026-11-24 : tâche créée pendant C-52 (hors périmètre).
