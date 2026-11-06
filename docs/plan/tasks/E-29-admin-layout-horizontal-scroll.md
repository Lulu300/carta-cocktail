---
id: E-29
title: "Admin : la page des bouteilles défile horizontalement en 1280 px"
phase: E
lane: frontend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-09]
touches: [frontend/src/components/layout/AdminLayout.tsx, frontend/src/components/layout/AdminLayout.test.tsx, frontend/src/components/admin/DataTable.tsx, frontend/src/components/admin/DataTable.test.tsx, frontend/src/components/admin/bottles/BottleHistoryTable.tsx]
sources: ["06-frontend-ux-perf.md §3"]
branch:
pr:
---

## Contexte

Relevé par la relecture de la PR #128 (E-09), dans Chromium : sur `/admin/bottles`, en 1280 px de large, la page fait 1320 px et défile horizontalement. Le défaut existait déjà avant E-09.

## Problème constaté

- `AdminLayout.tsx` : en grand écran, la barre latérale (`aside`, `w-64 … lg:static`) est un élément flex sans `shrink-0`. Elle est écrasée (182 px mesurés au lieu de 256).
- La colonne de contenu (`div.flex-1.flex.flex-col`) n'a pas `min-w-0` : un élément flex garde par défaut la largeur minimale de son contenu, donc la table des bouteilles (environ 1088 px) élargit toute la page au lieu de défiler dans son conteneur.
- `DataTable.tsx` enveloppe la table dans un `div` en `overflow-hidden` (coins arrondis) : avec `min-w-0` seul, les colonnes de droite seraient coupées au lieu de défiler.

## Ce qu'il faut faire

1. `AdminLayout` : `lg:shrink-0` (ou `shrink-0`) sur la barre latérale, `min-w-0` sur la colonne de contenu.
2. Table : défilement horizontal autour du seul `<table>` (un `div` en `overflow-x-auto`), pas sur l'enveloppant de `DataTable`, qui contient aussi `LoadError`, le message vide, `LiveResultCount` et `Pagination` (la pagination défilerait avec la table). Coins arrondis conservés. Les deux seules tables sont `DataTable` (dont les groupes de `BottlesPage`, via `renderRow`) et `components/admin/bottles/BottleHistoryTable.tsx` (aussi en `overflow-hidden`).
3. Listes sans `DataTable` : `IngredientsPage.tsx:183` et `CocktailsPage.tsx:101` et `:116` ont leurs propres conteneurs `overflow-hidden` (grilles et cartes, pas de table). Les vérifier ; s'il faut les modifier, les ajouter à `touches` et le noter au Journal (règle 4).
4. Vérifier toutes les pages admin à 1024 et 1280 px.

## Critères d'acceptation

- [ ] À 1024 et 1280 px, aucune page admin ne défile horizontalement ; la barre latérale garde 256 px.
- [ ] Une table plus large que son conteneur défile dans son conteneur, au clavier aussi : les boutons de la dernière colonne la font défiler au Tab ; sinon, un conteneur focusable nommé par `aria-labelledby` vers le titre de la page, seulement quand la table déborde (pas d'arrêt de tabulation en plus sur une table qui tient).
- [ ] Mobile inchangé (tiroir d'E-09, `max-lg:invisible`).

## Tests à ajouter ou adapter

- jsdom ne calcule pas la mise en page : test de classes minimal dans `AdminLayout.test.tsx`, plus une mesure manuelle (largeur du document à 1280 px, avant/après) dans la PR.

## Points d'attention

- Ne pas toucher à la transition du tiroir mobile (focus à l'ouverture, E-09).
- Les fichiers recoupent E-15 et E-18 (prêtes), E-10, E-14, puis B-14, F-06, F-09 et F-10 : à enchaîner avec ces tâches.

## Journal

- 2026-10-12 : tâche créée après la relecture de la PR #128 (E-09).
