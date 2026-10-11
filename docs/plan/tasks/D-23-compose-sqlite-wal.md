---
id: D-23
title: "Compose : transmettre SQLITE_WAL depuis .env"
phase: D
lane: infra
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [D-13]
touches: [docker-compose.yml, docker-compose.prod.yml, README.md, .env.example]
sources: ["02-backend-data-perf.md §3.4"]
branch:
pr:
---

## Contexte

Trouvé pendant D-13. Les deux fichiers compose listent les variables du backend une à une (`environment`) et lisent la plupart depuis `.env` (`JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_RESET_PASSWORD`). `SQLITE_WAL` (C-02) n'y figure pas.

## Problème constaté

- Une ligne `SQLITE_WAL=false` dans le `.env` placé à côté du compose n'atteint pas le conteneur : la base reste en WAL, y compris sur un partage réseau où le WAL ne fonctionne pas.
- Le README (D-13) et `UPGRADING.md` (v1.6.0) demandent donc d'ajouter la variable à la main dans la liste `environment` du compose, contrairement aux autres variables, qui se règlent dans `.env`.

## Ce qu'il faut faire

1. `docker-compose.yml` et `docker-compose.prod.yml` : ajouter `- SQLITE_WAL=${SQLITE_WAL:-true}` à l'`environment` de `carta-cocktail-backend`.
2. README, section « Database files and network shares » et ligne `SQLITE_WAL` du tableau : remplacer la consigne d'édition du compose par « dans `.env` ». `.env.example` : retirer la remarque sur Docker.
3. Noter dans la PR (« Required actions ») qu'une instance qui a déjà ajouté `- SQLITE_WAL=false` à son compose n'a rien à changer.

## Critères d'acceptation

- [ ] `SQLITE_WAL=false` dans `.env` donne `SQLite journal mode: delete` au démarrage du conteneur (`docker compose up`).
- [ ] Sans la variable, le log affiche `SQLite journal mode: wal`.

## Tests à ajouter ou adapter

- Aucun test automatique ; essai manuel décrit dans la PR (`docker compose config` puis démarrage avec et sans la variable).

## Points d'attention

- Zone séquentielle : `docker-compose*.yml` (voir `docs/plan/README.md`). Regrouper avec une autre tâche compose si l'une est ouverte.
- `UPGRADING.md` n'est pas modifié par la tâche (règle 9) : le coordinateur adapte la section v1.6.0 au moment de la release s'il le juge utile.

## Journal

- 2026-10-11 : tâche créée pendant D-13 (les compose ne transmettent pas `SQLITE_WAL` depuis `.env`).
