---
id: B-11
title: "Alerte deepmerge-ts dans la CLI Prisma"
phase: B
lane: deps
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [A-07]
touches: [backend/package.json, backend/package-lock.json]
sources: ["08-dependencies.md §5"]
branch:
pr:
---

## Contexte

Après A-07, `npm audit` (dépendances de dev comprises) côté backend signale encore `deepmerge-ts` < 8.0.0 (haute, GHSA-ggr8-5vv4-36mx : épuisement de pile sur un graphe d'objets récursif). Le paquet vient de `prisma` 6.19.3 → `@prisma/config` → `deepmerge-ts` 7.1.5. `npm audit --omit=dev` ne le voit pas, parce que `prisma` est en `devDependencies`.

## Problème constaté

- `npm audit fix --force` propose de **descendre** `prisma` en 6.12.0 : à refuser.
- `@prisma/config` 7.10.0 dépend toujours de `deepmerge-ts` 7.1.5 : Prisma 7 (C-15) ne corrige pas l'alerte.
- Le Dockerfile actuel exécute la CLI Prisma au démarrage (`db push`). `deepmerge-ts` n'y fusionne que la configuration Prisma, sans entrée utilisateur. L'impact réel est faible.

## Ce qu'il faut faire

1. Vérifier si une version de `prisma` ou `@prisma/config` dépend de `deepmerge-ts` ≥ 8.
2. Sinon, évaluer une surcharge `"overrides": { "deepmerge-ts": "^8.0.2" }` dans `backend/package.json` : `npx prisma generate`, `npx prisma db push` sur une base de test et `npm test` doivent passer.
3. Si la surcharge casse la CLI, laisser l'alerte, noter la décision dans le Journal et passer la tâche en `dropped`.

## Critères d'acceptation

- [ ] `npm audit` backend ne signale plus `deepmerge-ts`, ou la décision de garder l'alerte est notée dans le Journal.
- [ ] `prisma generate`, `prisma db push` et les tests backend passent.

## Tests à ajouter ou adapter

Aucun : la suite backend utilise la CLI Prisma pour créer la base de test.

## Points d'attention

- Ne pas lancer `npm audit fix --force`.
- Une seule tâche à la fois sur `backend/package-lock.json` (B-04, B-05, B-07, B-09, C-15).

## Journal

- 2026-10-08 : tâche créée par A-07 après l'audit complet du backend.
