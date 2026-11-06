---
id: B-20
title: "Avis moderate restants dans les dépendances de production du backend"
phase: B
lane: deps
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [B-19]
touches: [backend/package.json, backend/package-lock.json]
sources: []
branch:
pr:
---

## Contexte

B-19 a corrigé les trois avis `high` qui bloquaient l'audit du job Backend de la CI (`npm audit --omit=dev --audit-level=high`). Le seuil ne regarde pas les avis `moderate`, et plusieurs subsistent dans les dépendances de production. Ils existaient déjà avant B-19.

## Problème constaté

Au 2026-11-05, après B-19, `npm audit --omit=dev` backend signale 5 avis `moderate` dans trois paquets (14 `moderate` avec les dépendances de dev) :

- `fast-uri` 3.1.8 (GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp), via `prisma` → `@prisma/dev` → `@prisma/streams-local` → `ajv` 8.20.0 (`fast-uri: ^3.0.1`) : corrigé en 3.1.9, compris dans la borne d'`ajv`, donc mise à jour du lockfile seule ;
- `ip-address` 10.7.3 (GHSA-rxp7-6hxx-x8q5), via `express-rate-limit` 8.7.0 (`^10.2.0`) : corrigé à partir de 10.7.4 (10.7.6 publiée), lockfile seul ;
- `minimatch` 10.2.6 (GHSA-g3hv-75wg-m249, plage vulnérable 7.0.0 à 11.0.0), via `archiver` 8.0.0 → `readdir-glob` 3.0.0 (`minimatch: ^10.2.2`) : aucune 10.x corrigée, correctif en 11.0.1 ou plus. `npm audit fix --force` propose de descendre `archiver` en 7.0.1 : à refuser. `eslint` et `typescript-eslint` l'utilisent aussi (dev).

## Ce qu'il faut faire

1. `fast-uri` et `ip-address` : `npm update fast-uri ip-address` dans `backend/`, vérifier le lockfile (pas d'autre montée imprévue) et `npm ls`.
2. `minimatch` : chercher une version d'`archiver` ou de `readdir-glob` qui accepte `minimatch` 11. Sinon, évaluer une surcharge ciblée (`"readdir-glob": { "minimatch": "^11.0.1" }`) et vérifier l'API utilisée par `readdir-glob` (export `Minimatch`, options) ; sans garantie, laisser l'avis et le noter dans le Journal.
3. Après chaque changement : `npm audit --omit=dev`, `npm test` (l'export ZIP des sauvegardes passe par `archiver`), build de l'image backend.

## Critères d'acceptation

- [ ] `npm audit --omit=dev` backend ne signale plus `fast-uri` ni `ip-address`.
- [ ] `minimatch` corrigé, ou la décision de garder l'avis notée dans le Journal.
- [ ] `npm ci`, `tsc`, lint, build et `npm test` passent ; jobs « Docker build (backend) » et Smoke verts.

## Tests à ajouter ou adapter

Aucun si aucune ligne de code ne change : les tests de sauvegarde couvrent `archiver`, ceux du login couvrent `express-rate-limit`.

## Points d'attention

- Une seule tâche à la fois sur `backend/package-lock.json`.
- `fast-uri` vient de la CLI Prisma, dont le `Dockerfile` coupe des arêtes du graphe (D-30, `backend/docker/prune-unused-deps.mjs`) : vérifier le job « Docker build (backend) ». L'arête `@prisma/dev:@prisma/streams-local` est déjà coupée : `fast-uri` est absent de l'image livrée, l'avis ne concerne que l'audit du lockfile (relevé par la relecture de la PR #146, vérifié sur l'image construite par celle de la PR #150).
- Pas de `npm audit fix --force` ; ne pas baisser le seuil de l'audit dans `ci.yml`.

## Journal

- 2026-11-05 : tâche créée par B-19 (PR #146) après l'audit complet du backend.
- 2026-11-05 : B-16 (PR #150) monte Prisma en 7.10.1 et retire les surcharges `deepmerge-ts` / `mysql2`. Les avis listés plus haut ne changent pas. `fast-uri` reste en 3.1.8 par le même chemin : `@prisma/dev` 0.24.17 ne change pas en 7.10.1, même si les notes de version de Prisma citent `fast-uri`. `npm audit --omit=dev` reste à 5 `moderate` (14 avec le dev). Le point d'attention ne vaut plus : B-16 n'attend plus de version de Prisma. Lancer B-20 après son merge (même lockfile).
- 2026-11-05 : PR docs de suivi du lot E-15/B-13/C-42/B-19/B-16. Points d'attention mis à jour après le merge de B-16 (PR #150) : la contrainte de lockfile partagé avec B-16 et l'attente d'une version de Prisma ne valent plus ; `fast-uri` est absent de l'image livrée (coupe D-30), relevé par la relecture de la PR #146 et vérifié sur l'image par celle de la PR #150.
- 2026-11-06 : après le merge de v1.12.0 sur `main` (PR #161), Dependabot ouvre sur `main` les alertes `fast-uri` (2 `medium`, 2 `low`) et `minimatch` (1 `medium`) de `backend/package-lock.json` ; l'alerte `ip-address` (1 `medium`) y était déjà ouverte depuis le 2026-10-31. Toutes sont déjà listées ci-dessus. Les alertes du frontend (dev : `undici`, `minimatch`) vont à B-21.
