---
id: D-16
title: "Retirer le bruit des logs du backend en production"
phase: D
lane: infra
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [D-01, B-03]
touches: [backend/src/config.ts, backend/prisma/seed.ts, backend/Dockerfile]
sources: []
branch:
pr:
---

## Contexte

Lors du passage en v1.6.0 d'une instance réelle (2026-10-10), les logs du backend au démarrage contenaient surtout des messages sans rapport avec l'application. Les lignes utiles (sauvegarde, migrations, mode WAL, port) s'y perdent, alors que les notes de version demandent justement à l'utilisateur de les chercher.

## Problème constaté

Logs de `docker compose logs carta-cocktail-backend` au démarrage de l'image `backend:1.6.0` :

- encadré de Prisma proposant une mise à jour (`npm i @prisma/client@latest`) à chaque `prisma migrate` lancé par l'entrypoint ;
- `◇ injected env (0) from .env // tip: …` affiché deux fois par dotenv 17 (`backend/src/config.ts:4`, `backend/prisma/seed.ts:7`), alors qu'il n'y a aucun `.env` dans l'image ;
- bannière publicitaire d'i18next (traitée par B-03 avec `showSupportNotice: false`, dont cette tâche dépend).

## Ce qu'il faut faire

1. `backend/src/config.ts` et `backend/prisma/seed.ts` : `dotenv.config({ path, quiet: true })`.
2. `backend/Dockerfile` : `ENV CHECKPOINT_DISABLE=1`, qui coupe l'appel à `checkpoint.prisma.io` (source de l'encadré de mise à jour et de télémétrie à chaque démarrage). Si l'encadré reste, ajouter `PRISMA_HIDE_UPDATE_MESSAGE=1` (vérifié dans le CLI Prisma 6.19).
3. Vérifier que la bannière i18next a disparu (B-03).

## Critères d'acceptation

- [ ] Au démarrage du conteneur, les logs ne contiennent ni l'encadré de mise à jour de Prisma, ni les lignes `injected env` de dotenv, ni la bannière d'i18next.
- [ ] Les lignes utiles restent : sauvegarde `pre-migrate-*` ou « No pending migrations », `SQLite journal mode`, `Carta Cocktail API running on port`.

## Tests à ajouter ou adapter

- Aucun test unitaire. Construire l'image, la démarrer sur un volume vide puis sur une base existante, et coller les logs dans la PR.

## Points d'attention

- `touches` recoupe D-01 (`backend/Dockerfile`) : lancer après D-01.
- dotenv : `quiet: true` fonctionne en 17 et en 18 (B-07), qui logue toujours par défaut. Préférer l'option à la variable d'environnement, dont le nom change entre les deux versions (`DOTENV_CONFIG_QUIET`, `DOTENV_QUIET`). C-15 ajoutera `import 'dotenv/config'` dans `backend/prisma.config.ts`, ce qui fera revenir la ligne `injected env` : la traiter dans C-15 ou ici, selon l'ordre.
- Ne pas couper les logs de l'entrypoint ni ceux de `prisma migrate deploy` : les notes de version s'y réfèrent.

## Journal

- 2026-10-10 : tâche créée après la mise à jour en v1.6.0 d'une instance réelle (logs collés par l'humain).
