---
id: B-16
title: "Retirer les surcharges deepmerge-ts et mysql2 quand Prisma les corrige"
phase: B
lane: deps
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [B-11]
touches: [backend/package.json, backend/package-lock.json, .github/workflows/ci.yml]
sources: ["08-dependencies.md §5"]
branch:
pr:
---

## Contexte

B-11 a ajouté dans `backend/package.json` les surcharges `"overrides": { "deepmerge-ts": "^8.0.2", "mysql2": "^3.24.5" }` : `prisma` 7.10.0 (dépendance d'exécution depuis D-01) épingle `mysql2` 3.15.3 et `@prisma/config` 7.10.0 épingle `deepmerge-ts` 7.1.5, tous deux visés par des avis `high`. Le commentaire de l'étape « Audit production dependencies » du job Backend de `ci.yml` renvoie à cette tâche.

## Problème constaté

- Une surcharge reste active après les montées de version : si une future `prisma` demande `deepmerge-ts` 9 ou `mysql2` 4, la surcharge l'en empêche sans le dire.
- Au 2026-10-12, seules des pré-versions corrigent : `@prisma/config` 8.1.0-dev dépend de `deepmerge-ts` 8.0.2, et `prisma` 8 n'existe qu'en `8.0.0-rc`.

## Ce qu'il faut faire

1. À chaque montée de `prisma` (Dependabot ignore les majeures de Prisma : montée manuelle), vérifier `npm view prisma@<version> dependencies` et `npm view @prisma/config@<version> dependencies`.
2. Quand `deepmerge-ts` ≥ 8.0.0 et `mysql2` ≥ 3.23.1 y sont épinglés, retirer les surcharges devenues inutiles, régénérer le lockfile et relancer `npm audit --omit=dev`.
3. Mettre à jour le commentaire de l'étape d'audit du job Backend de `ci.yml`.

## Critères d'acceptation

- [ ] `backend/package.json` n'a plus de surcharge inutile.
- [ ] `npm audit --omit=dev` backend reste à 0 `high`, `prisma generate`, `prisma migrate deploy` et les tests backend passent.
- [ ] Le commentaire de l'étape d'audit de `ci.yml` ne cite plus les surcharges retirées.

## Tests à ajouter ou adapter

Aucun : la suite backend utilise la CLI Prisma pour créer la base de test.

## Points d'attention

- Ne pas passer sur une pré-version de Prisma (`8.0.0-rc`, `dev`) pour retirer une surcharge.
- Ne jamais baisser le seuil de l'audit dans `ci.yml`.
- Une seule tâche à la fois sur `backend/package-lock.json`.

## Journal

- 2026-10-12 : tâche créée par B-11 (surcharges posées en attendant une version stable de Prisma qui corrige).
