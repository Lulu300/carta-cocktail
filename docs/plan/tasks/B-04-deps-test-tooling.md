---
id: B-04
title: "Dépendances lot 4 : outillage de test (Vitest 5, jsdom 29, jest-dom 7)"
phase: B
lane: deps
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [A-07, B-01, B-02]
touches: [backend/package.json, backend/package-lock.json, frontend/package.json, frontend/package-lock.json, backend/vitest.config.ts, frontend/vitest.config.ts, frontend/src/test/, .gitignore]
sources: ["08-dependencies.md §3.2", "08-dependencies.md §3.10", "08-dependencies.md §3.11", "08-dependencies.md §5"]
branch: chore/B-04-deps-test-tooling
pr: "#73"
---

## Contexte

Vitest 4 → 5, jsdom 28 → 29 et jest-dom 6 → 7 sont des montées à faible effort mais qui peuvent faire dériver la couverture. Il faut les faire **après** B-02 (couverture honnête), pour que les chiffres avant/après soient comparables, et après B-01 (Vitest 5 exige Node ≥ 22.12).

## Problème constaté

- Les deux paquets sont en `vitest` et `@vitest/coverage-v8` 4.0.18 (4.1.11 après A-07).
- Frontend : `jsdom` 28.1.0, `@testing-library/jest-dom` 6.9.1.
- Changements de Vitest 5 qui touchent ce dépôt :
  - les motifs `coverage.include` / `coverage.exclude` **sans joker sont traités comme des dossiers** : `'src/index.ts'` (backend), `'src/main.tsx'` et `'src/vite-env.d.ts'` (frontend) risquent de ne plus être exclus ;
  - `clearMocks: true` par défaut ;
  - les reporters écrivent sous `.vitest/`.
- jest-dom 7 : `@testing-library/dom` devient peer obligatoire (déjà présent en transitif via RTL).

## Ce qu'il faut faire

1. **Backend** : `npm install -D vitest@^5.0.3 @vitest/coverage-v8@^5.0.3`.
2. **Frontend** : `npm install -D vitest@^5.0.3 @vitest/coverage-v8@^5.0.3 jsdom@^29.1.1 @testing-library/jest-dom@^7.0.1 @testing-library/dom@^10`.
3. Garder **la même version de Vitest** dans les deux paquets.
4. Relancer `npm test -- --coverage` dans chaque paquet et comparer avec les chiffres de la PR B-02. Si `src/index.ts` ou `src/main.tsx` apparaissent dans le rapport, réécrire les exclusions avec un motif explicite (ex. `'src/index.ts'` → `'**/src/index.ts'`, à vérifier sur le rapport).
5. Vérifier que `coverage/coverage-final.json` est toujours produit au même endroit (le script `delta-coverage.mjs` le lit).
6. Ajouter `.vitest/` au `.gitignore` racine.

## Critères d'acceptation

- [x] Vitest 5.0.x installé dans les deux paquets, versions identiques.
- [x] jsdom 29.1.x (pas 30 : il exige Node ≥ 24.15) et jest-dom 7 côté frontend, `@testing-library/dom` explicite.
- [x] Tous les tests passent ; couverture globale à ±1 point de la mesure B-02 (sinon expliquer l'écart).
- [x] Les fichiers exclus avant le sont toujours.
- [x] Le job CI de delta-coverage passe sur la PR.

## Tests à ajouter ou adapter

Aucun nouveau test. Si un test casse à cause de `clearMocks` (compteur d'appels cumulé entre deux tests), c'est un vrai défaut d'isolation : corriger le test avec un `beforeEach` explicite.

## Points d'attention

- `getComputedStyle` a régressé en jsdom 29.0.0 et a été corrigé en 29.0.1 : prendre 29.1.x.
- Une PR par paquet est possible (lockfiles distincts) mais garder les deux dans la même tâche pour aligner les versions.

## Journal

- 2026-10-08 : tâche créée à partir du rapport de dépendances.
- 2026-10-11 : vitest et @vitest/coverage-v8 5.0.3 dans les deux paquets, jsdom 29.1.1, jest-dom 7.0.1, @testing-library/dom 10.4.2 explicite, `.vitest/` ignoré. Les exclusions de couverture marchent sans changement (aucun fichier ajouté au rapport ni retiré), donc les `vitest.config.ts` ne changent pas. Aucun test cassé par `clearMocks`. Couverture origin/develop → Vitest 5 : backend statements 94,23 → 94,22 % (1471/1561 → 1468/1558), branches 81,94 % et functions 98,54 % inchangées, lines 95,51 → 95,50 % (1364/1428 → 1361/1425) ; frontend inchangé (statements 68,19 %, branches 59,27 %, functions 62,82 %, lines 69,84 %). Écart backend de 0,01 point accepté par l'humain : coverage-v8 5 ne compte plus trois instructions qui étaient couvertes (`backup.ts:37` et `:105`, `recipeDefectsService.ts:33`), ce n'est pas une perte de couverture. Delta coverage N/A (aucune ligne de code modifiée). PR #73.
