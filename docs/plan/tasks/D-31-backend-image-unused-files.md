---
id: D-31
title: "Image backend : fichiers jamais chargés dans les paquets gardés"
phase: D
lane: infra
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [D-30]
touches: [backend/Dockerfile, backend/docker/prune-unused-deps.mjs]
sources: []
branch:
pr:
---

## Décisions validées (2026-10-13)

- **Groupes peu risqués seulement** (décision de l'humain, relecture de la PR #138) : « D-31 limitée à l'UI Studio + metafiles, `better-sqlite3/deps` et `.map`, avec garde-fous ; abandon si le gain compressé est faible. » La CLI Prisma reste dans l'image (décision « Garder la CLI », Journal de D-30). Les compilateurs de requêtes de `@prisma/client/runtime` et de `prisma/build`, `@prisma/dev` et les `.d.ts` restent hors de la tâche.

## Contexte

D-30 retire de l'image backend les paquets que l'API et la CLI Prisma ne chargent jamais (Prisma Studio et ses dépendances React, le serveur Postgres local de `prisma dev`, les pilotes MySQL et Postgres, `prebuild-install`) : `node_modules` passe de 362 à 285 Mio sur disque, l'image de 165 à 148 Mo compressée. Elle ne touche pas aux fichiers des paquets gardés.

## Problème constaté

Mesuré dans l'image de D-30 (`du`, Mio sur disque, arm64), pour les trois groupes retenus :

- `@prisma/studio-core` (42 Mio) reste, car `prisma/build/cli.js` charge au démarrage, quelle que soit la commande, quatre modules de `dist/data/` (6,6 Mio, sans dépendance). L'interface web `dist/ui/` (29 Mio) et les fichiers `dist/metafile-*.json` (5 Mio) ne servent qu'à `prisma studio`, qui ne marche plus dans l'image depuis D-30.
- `better-sqlite3/deps` (10 Mio) : sources de SQLite, utiles seulement à la compilation du module natif pendant `npm ci`.
- Fichiers `.map` (18 Mio) dans tout `node_modules` : jamais chargés sans `--enable-source-maps`.

## Ce qu'il faut faire

1. Retirer dans l'étage `prod-deps` (après le nettoyage de D-30, avant le contrôle `prisma --version`) : `@prisma/studio-core/dist/ui/`, `@prisma/studio-core/dist/metafile-*.json`, `better-sqlite3/deps/` et les fichiers `.map` de `node_modules`.
2. Garde-fou pour chacun : le build s'arrête quand un chemin attendu n'existe plus (`dist/ui/`, au moins un `metafile-*.json`, `deps/`), pour qu'une mise à jour qui les renomme se voie. Pour les `.map`, vérifier qu'aucun fichier gardé ne les charge (`--enable-source-maps` absent de l'image et de l'entrypoint).
3. Vérifier que l'API, l'entrypoint et les commandes de README et UPGRADING ne chargent aucun fichier retiré (mêmes scénarios que D-30).
4. Mesurer le gain **compressé** (taille de l'image téléchargée), pas seulement le gain sur disque. S'il est faible, abandonner la tâche (`status: dropped`, avec la mesure dans le Journal).

## Critères d'acceptation

- [ ] Les trois groupes sont retirés, chacun avec son garde-fou, ou la tâche est abandonnée avec la mesure du gain compressé dans le Journal.
- [ ] Les vérifications de D-30 passent toujours : démarrage sur une copie du jeu d'essai, installation neuve, refus C-18 et de la baseline identiques, commandes de README et UPGRADING, banc `1.4.0,local`, Smoke.
- [ ] Taille de l'image avant/après dans la PR, compressée et sur disque, en amd64 et en arm64.

## Tests à ajouter ou adapter

- Aucun test unitaire attendu. Vérifications dans l'image décrites dans la PR.

## Points d'attention

- D-26 touche aussi `backend/Dockerfile` : enchaîner.
- Un retrait qui casse la CLI ne se voit qu'à l'exécution : le contrôle `prisma --version` de `prod-deps` couvre le chargement au démarrage, le Smoke couvre `migrate deploy`, pas la baseline ni `migrate diff`. Garder le banc sur `1.4.0,local`.

## Journal

- 2026-10-13 : tâche créée par D-30 (mesures dans l'image de D-30).
- 2026-10-13 : décision de l'humain (relecture de la PR #138) : « Groupes peu risqués ». Tâche limitée à l'UI Studio et ses metafiles, `better-sqlite3/deps` et les `.map` ; `owner` passe à `agent`.
