---
id: E-16
title: "eslint-plugin-react-hooks 7.1 : corriger les deux setState synchrones dans un effet"
phase: E
lane: deps
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [A-07]
touches: [frontend/package.json, frontend/package-lock.json, frontend/src/pages/admin/CocktailsPage.tsx, frontend/src/pages/admin/MenuBottleEditPage.tsx]
sources: ["08-dependencies.md §5"]
branch:
pr:
---

## Contexte

Le lot 1 des dépendances (A-07) devait monter `eslint-plugin-react-hooks` de 7.0.1 à 7.1.1. Avec 7.1.1, `npm run lint` échoue sur deux erreurs `react-hooks/set-state-in-effect`. A-07 ne touche que les `package.json` et les lockfiles : le plugin y est resté en `~7.0.1` pour garder le lint vert.

## Problème constaté

Avec `eslint-plugin-react-hooks` 7.1.1 (lint du 2026-10-08) :

- `frontend/src/pages/admin/CocktailsPage.tsx:75` : `loadAvailability()` appelle `setLoadingAvailability(true)` de façon synchrone dans le `useEffect` de chargement initial.
- `frontend/src/pages/admin/MenuBottleEditPage.tsx:78` : `useEffect(() => { load(); }, [load])`, où `load` est un `useCallback` asynchrone qui met à jour six états.

Avec 7.1.1, la directive `eslint-disable-next-line react-hooks/set-state-in-effect` de `SettingsPage.tsx:49` sert de nouveau : l'avertissement « directive inutile » disparaît.

## Ce qu'il faut faire

1. `cd frontend && npm install -D eslint-plugin-react-hooks@^7.1.1`.
2. Corriger les deux composants sans désactiver la règle. Par exemple, dans `CocktailsPage`, ne pas repasser `loadingAvailability` à `true` au premier chargement (l'état initial vaut déjà `true`) et le faire seulement au rechargement après import. Dans `MenuBottleEditPage`, déplacer les `setState` dans le `.then` de la promesse lancée par l'effet.
3. Lancer `npm run lint`, `npx tsc -b --noEmit`, `npm test`.

## Critères d'acceptation

- [ ] `eslint-plugin-react-hooks` en 7.1.x, plage `^7.1.1` dans `frontend/package.json`.
- [ ] `npm run lint` sans erreur, sans nouvelle directive `eslint-disable`.
- [ ] Le chargement initial et le rechargement après import des cocktails affichent toujours l'état de disponibilité ; l'éditeur de menu de bouteilles charge toujours le menu.
- [ ] Tests verts.

## Tests à ajouter ou adapter

Vérifier que les tests de `CocktailsPage` et `MenuBottleEditPage` couvrent le chargement initial. En ajouter un si ce n'est pas le cas.

## Points d'attention

- E-06 et E-07 réécrivent ces deux pages. Si l'une d'elles est en cours, faire cette tâche après elle, ou l'intégrer à sa PR et passer celle-ci en `dropped`.
- Une seule tâche à la fois sur `frontend/package-lock.json`.
- E-14 (étape 6) supprime la directive `eslint-disable-next-line react-hooks/set-state-in-effect` de `SettingsPage.tsx:49` comme inutile et active `reportUnusedDisableDirectives: 'error'`. Avec 7.1.1, cette directive sert de nouveau. Si E-14 passe après E-16, il faut corriger le code de `SettingsPage` (initialiser `email` depuis `user`) au lieu de simplement retirer la directive.

## Journal

- 2026-10-08 : tâche créée par A-07, qui a gardé le plugin en `~7.0.1`.
