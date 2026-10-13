---
id: D-31
title: "Image backend : fichiers jamais chargés dans les paquets gardés"
phase: D
lane: infra
criticite: basse
effort: S
status: todo
owner: mixed
depends_on: [D-30]
touches: [backend/Dockerfile, backend/docker/prune-unused-deps.mjs]
sources: []
branch:
pr:
---

## Contexte

D-30 retire de l'image backend les paquets que l'API et la CLI Prisma ne chargent jamais (Prisma Studio et ses dépendances React, le serveur Postgres local de `prisma dev`, les pilotes MySQL et Postgres, `prebuild-install`) : `node_modules` passe de 362 à 285 Mo sur disque. Elle ne touche pas aux fichiers des paquets gardés.

## Problème constaté

Mesuré dans l'image de D-30 (`du`, Mo sur disque, arm64) :

- `@prisma/studio-core` (42 Mo) reste, car `prisma/build/cli.js` charge au démarrage, quelle que soit la commande, quatre modules de `dist/data/` (6,6 Mo, sans dépendance). L'interface web `dist/ui/` (29 Mo) et les fichiers `metafile-*.json` (5 Mo) ne servent qu'à `prisma studio`.
- `@prisma/dev` (18 Mo) reste pour la même raison : la CLI ne charge que `dist/state.cjs` (16 Ko).
- `@prisma/client/runtime` (71 Mo) contient les compilateurs de requêtes de toutes les bases : 53 Mo pour PostgreSQL, MySQL, SQL Server et CockroachDB, que l'application SQLite ne charge pas.
- `prisma/build` (40 Mo) : `studio.js` et `studio.css` (4 Mo), compilateurs de requêtes de toutes les bases (25 Mo), dont l'usage par `migrate` reste à vérifier.
- `better-sqlite3/deps` (10 Mo) : sources de SQLite, utiles seulement à la compilation.
- Fichiers `.map` (18 Mo) et `.d.ts` (13 Mo) dans tout `node_modules`.

## Ce qu'il faut faire

1. Décision humaine : retirer des fichiers à l'intérieur de paquets gardés est plus fragile que retirer des paquets entiers (une mise à jour de Prisma peut charger un fichier retiré). Décider si le gain vaut ce risque, et pour quels groupes.
2. Pour chaque groupe retenu, vérifier commande par commande (démarrage, `migrate deploy`, `diff`, `resolve`, `status`, `check-integrity.js`, API) que rien ne charge les fichiers retirés, puis les retirer dans l'étage `prod-deps`, avec un garde-fou qui arrête le build quand un chemin attendu n'existe plus.
3. Mesurer la taille de l'image avant et après.

## Critères d'acceptation

- [ ] Décision de l'humain notée dans le Journal (groupes retenus ou tâche abandonnée).
- [ ] Les vérifications de D-30 passent toujours : démarrage sur une copie du jeu d'essai, installation neuve, refus C-18 et de la baseline identiques, commandes de README et UPGRADING, banc `1.4.0,local`, Smoke.
- [ ] Taille de l'image avant/après dans la PR.

## Tests à ajouter ou adapter

- Aucun test unitaire attendu. Vérifications dans l'image décrites dans la PR.

## Points d'attention

- D-26 touche aussi `backend/Dockerfile` : enchaîner.
- Un retrait qui casse la CLI ne se voit qu'à l'exécution : le Smoke couvre `migrate deploy`, pas la baseline ni `migrate diff`. Garder le banc sur `1.4.0,local`.

## Journal

- 2026-10-13 : tâche créée par D-30 (mesures dans l'image de D-30).
