---
id: B-21
title: "Avis Dependabot des dépendances de dev du frontend : undici et minimatch"
phase: B
lane: deps
criticite: basse
effort: S
status: done
owner: agent
depends_on: []
touches: [frontend/package.json, frontend/package-lock.json]
sources: []
branch: chore/B-21-deps-frontend-dev-undici
pr: "#170"
---

## Contexte

Au 2026-11-06, après le merge de v1.12.0 sur `main` (PR #161), Dependabot liste 12 alertes ouvertes sur `main`. Les alertes du backend (`fast-uri`, `ip-address`, `minimatch`) relèvent de B-20. Restent celles du frontend, toutes dans des dépendances de dev : elles n'entrent pas dans l'image, puisque le frontend publie un build statique servi par nginx. Elles tournent en revanche dans la CI et sur les postes de développement.

## Problème constaté

Lockfile de `develop` au 2026-11-06 :

- `undici` 7.30.0, via `jsdom` 29.1.1 (environnement des tests Vitest, qui accepte `^7.25.0`) : 4 alertes `high` (#4 GHSA-xjj6-f33q-929c, #8 GHSA-4w7w-5xrc-9h26, #9 GHSA-qrxm-fqhp-jwvm, #11 GHSA-2m5v-pch6-74hx) et 1 `medium` (#10 GHSA-9fm3-97px-rjf6), corrigées en 7.30.1. Elles datent du 2026-10-31 et du 2026-11-03 : `undici` 7.30.0 était déjà dans le lockfile de `main`, ce n'est pas la release qui les a apportées.
- `minimatch` 10.2.6 : 1 alerte `medium` (#20 GHSA-g3hv-75wg-m249, plage vulnérable 7.0.0 à 11.0.0, correctif en 11.0.1), ouverte avec le merge de #161. Le paquet vient d'`eslint` (`^10.2.5`), d'`@eslint/config-array` (`^10.2.4`) et d'`@typescript-eslint/typescript-estree` (`^10.2.2`). La dernière version d'`eslint` (10.14.0) demande encore `^10.2.6`.

## Ce qu'il faut faire

1. `undici` : `npm update undici` dans `frontend/` (7.30.1 entre dans la plage de `jsdom`), vérifier le lockfile et `npm ls undici`.
2. `minimatch` : aucune version d'`eslint` n'accepte 11.x au 2026-11-06. Reprendre la décision prise pour le `minimatch` du backend dans B-20 (surcharge ciblée ou avis gardé) au lieu de refaire l'enquête, et la noter dans le Journal.
3. `npm audit` frontend, puis lint, `npx tsc -b`, `npm test` et le build.

## Critères d'acceptation

- [x] `npm audit` frontend ne signale plus `undici`.
- [x] `minimatch` corrigé, ou la décision de garder l'avis notée dans le Journal.
- [x] `npm ci`, lint, `npx tsc -b`, `npm test`, build et budget du bundle passent ; CI verte.
- [ ] Après le merge sur `main` à la release suivante, les alertes Dependabot correspondantes sont fermées.

## Tests à ajouter ou adapter

Aucun : dépendances de dev seulement, la suite existante (Vitest sous `jsdom`, lint) sert de test.

## Points d'attention

- Dépendances de dev seulement : pas de ligne dans les notes de version.
- Même lockfile que toute autre tâche `deps` du frontend : une seule à la fois.

## Journal

- 2026-11-12 : PR #170. Audit refait sur `develop` (a977616) : `npm audit` 11 avis (10 `moderate` dus à `minimatch` 10.2.6 et ses dépendants, 1 `high` pour `undici` 7.30.0, qui compte maintenant 8 GHSA, tous corrigés en 7.30.1) ; `npm audit --omit=dev` 0. `npm update undici` installe 7.30.2 (et non 7.30.1) : dernière 7.x de la plage `^7.25.0` de `jsdom` 29.1.1, publiée le 2026-11-05 ; seul `undici` bouge dans le lockfile. Pour `minimatch`, même choix que B-20 (décision humaine) : surcharge ciblée `"minimatch": "^11.0.1"` sous `eslint`, `@eslint/config-array` et `@typescript-eslint/typescript-estree`, les trois seuls paquets qui l'importent ; leurs dernières versions (10.14.0, 0.23.5, 8.72.2) demandent toujours `^10`. Elle installe 11.0.8 à la racine, plus `@isaacs/nonrecursive-glob-match` 1.1.0. API utilisée : classe `Minimatch` (options `dot`, `flipNegate`), `match(path, partial)` et la fonction `minimatch()` avec `dot`, inchangées en 11 ; ce que 11 retire (`makeRe`, `matchOne`, `AST`) n'est pas utilisé. Avec 10.2.6 puis 11.0.8, `eslint .` analyse les mêmes 309 fichiers et applique les mêmes `files`/`ignores`. Surcharge gardée : `npm ci`, lint, `npx tsc -b`, `npx vitest run --silent=false` (1093 tests, sortie console identique à `develop`), build (`dist/` identique octet pour octet), budget du bundle (132,60 kB) et `npm audit` (0, dev compris) passent. Retrait de la surcharge à suivre dans B-22 (extension au frontend par la PR docs de fin de lot) : sur une copie, retirer le bloc puis `npm install` laisse trois `minimatch` 10.2.6 imbriqués, qu'un `npm dedupe` ramène à la racine ; l'avis revient alors dans `npm audit`.
