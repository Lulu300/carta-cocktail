---
id: B-21
title: "Avis Dependabot des dépendances de dev du frontend : undici et minimatch"
phase: B
lane: deps
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [B-19]
touches: [frontend/package.json, frontend/package-lock.json]
sources: []
branch:
pr:
---

## Contexte

Après le merge de v1.12.0 sur `main` (PR #161, 2026-11-06), Dependabot liste 12 alertes ouvertes sur `main`. Les alertes du backend (`fast-uri`, `ip-address`, `minimatch`, dépendances de production) relèvent de B-20. Restent celles du frontend, toutes en dépendances de dev : elles n'entrent pas dans l'image (le frontend publie un build statique servi par nginx), mais elles tournent dans la CI et sur les postes de développement.

## Problème constaté

Lockfile de `develop` au 2026-11-06 :

- `undici` 7.30.0, via `jsdom` 29.1.1 (environnement des tests Vitest) : 4 alertes `high` et 1 `medium` (dont GHSA-4qv8-2p9j-2685, mémoire non bornée dans le parseur EventSource, et GHSA-f72v-6w45-q472, contournement de Subresource Integrity), corrigé en 7.30.1 ;
- `minimatch` 10.2.6 (dev) : 1 alerte `medium` (GHSA-g3hv-75wg-m249, plage vulnérable 7.0.0 à 11.0.0), correctif en 11.0.1.

## Ce qu'il faut faire

1. `undici` : `npm update undici` dans `frontend/` (ou une version de `jsdom` qui l'exige), vérifier le lockfile et `npm ls undici`.
2. `minimatch` : trouver le paquet qui l'amène (`npm ls minimatch`), chercher une version qui accepte 11.x ; sinon, évaluer une surcharge ciblée et l'API utilisée, ou noter la décision de garder l'avis.
3. `npm audit` frontend, puis lint, `npx tsc -b`, `npm test` et le build.

## Critères d'acceptation

- [ ] `npm audit` frontend ne signale plus `undici`.
- [ ] `minimatch` corrigé, ou la décision de garder l'avis notée dans le Journal.
- [ ] `npm ci`, lint, `npx tsc -b`, `npm test`, build et budget du bundle passent ; CI verte.
- [ ] Après le merge sur `main` à la release suivante, les alertes Dependabot correspondantes sont fermées.

## Points d'attention

- Dépendances de dev seulement : pas de ligne dans les notes de version.
- Même lockfile que toute autre tâche `deps` du frontend : une seule à la fois.

## Journal
