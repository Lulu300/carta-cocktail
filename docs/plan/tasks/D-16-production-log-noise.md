---
id: D-16
title: "Retirer le bruit des logs du backend en production"
phase: D
lane: infra
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [D-01]
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
- bannière publicitaire d'i18next (déjà traitée par B-03 avec `showSupportNotice: false`, ou par B-09 en passant à i18next 26).

## Ce qu'il faut faire

1. `backend/src/config.ts` et `backend/prisma/seed.ts` : `dotenv.config({ path, quiet: true })`.
2. `backend/Dockerfile` : désactiver le message de mise à jour du CLI Prisma (variable d'environnement prévue par Prisma 6, à vérifier : `PRISMA_HIDE_UPDATE_MESSAGE=1`).
3. Vérifier que la bannière i18next a disparu (B-03 ou B-09) ; sinon, la traiter ici.

## Critères d'acceptation

- [ ] Au démarrage du conteneur, les logs ne contiennent ni l'encadré de mise à jour de Prisma, ni les lignes `injected env` de dotenv, ni la bannière d'i18next.
- [ ] Les lignes utiles restent : sauvegarde `pre-migrate-*` ou « No pending migrations », `SQLite journal mode`, `Carta Cocktail API running on port`.

## Tests à ajouter ou adapter

- Aucun test unitaire. Construire l'image, la démarrer sur un volume vide puis sur une base existante, et coller les logs dans la PR.

## Points d'attention

- `touches` recoupe D-01 (`backend/Dockerfile`) : lancer après D-01.
- Ne pas couper les logs de l'entrypoint ni ceux de `prisma migrate deploy` : les notes de version s'y réfèrent.

## Journal

- 2026-10-10 : tâche créée après la mise à jour en v1.6.0 d'une instance réelle (logs collés par l'humain).
