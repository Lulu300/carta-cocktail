---
id: D-26
title: "Image backend : configuration de la CLI Prisma autonome, plus de src/ dans l'image"
phase: D
lane: infra
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [D-01]
touches: [backend/prisma.config.ts, backend/src/lib/databasePath.ts, backend/Dockerfile]
sources: []
branch:
pr:
---

## Contexte

D-01 (PR #108) ne met dans l'image backend que `dist/`, `prisma/`, `package.json`, `prisma.config.ts` et les dépendances de production. Une exception : `backend/prisma.config.ts` importe `./src/lib/databasePath` (C-15), et la CLI Prisma charge ces deux fichiers en TypeScript (jiti). L'image garde donc `src/lib/databasePath.ts` seul, ce qui contredit le critère « pas de `src` dans l'image » de D-01 (écart accepté par l'humain le 2026-10-12 pour cette PR).

## Problème constaté

- `backend/Dockerfile` : `COPY src/lib/databasePath.ts ./src/lib/`, la seule source de `src/` dans l'image.
- Un import ajouté plus tard dans `databasePath.ts` (vers `../config`, par exemple) casserait la CLI Prisma au démarrage du conteneur seulement : ni les tests ni `tsc` ne le verraient. Un commentaire en tête du fichier le rappelle depuis D-01.

## Ce qu'il faut faire

1. Rendre la configuration de la CLI autonome sans dupliquer la règle « chemin relatif résolu depuis `prisma/` » (une seule implémentation, voir C-26). Pistes : compiler la configuration dans `dist/` et la charger avec `--config`, ou faire de la règle un module sans dépendance qui reste chargé au même chemin relatif en développement et dans l'image.
2. Retirer `COPY src/lib/databasePath.ts` du Dockerfile.
3. Vérifier dans l'image : `migrate status`, `migrate deploy`, la baseline `0_init` et les commandes `--entrypoint` du README.

## Critères d'acceptation

- [ ] `docker run --rm --entrypoint ls <image> /app` ne montre pas `src`.
- [ ] Une seule implémentation de la conversion `DATABASE_URL` → chemin.
- [ ] L'entrypoint applique les migrations avec une `DATABASE_URL` absolue et avec une `DATABASE_URL` relative.

## Tests à ajouter ou adapter

- Tests de `databasePath` adaptés si le module change de place ; vérification manuelle de l'image décrite dans la PR.

## Points d'attention

- `prisma.config.ts` sert aussi en développement (`npx prisma migrate dev`, `db:check`) : ne pas imposer un `npm run build` avant les commandes Prisma.
- Les chemins de la configuration (`schema`, `migrations.path`) sont résolus depuis le dossier du fichier de configuration.

## Journal

- 2026-10-12 : tâche créée pendant D-01 (PR #108), sur décision de l'humain (question 3 de la PR).
