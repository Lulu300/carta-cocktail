---
id: D-16
title: "Retirer le bruit des logs du backend en production"
phase: D
lane: infra
criticite: basse
effort: S
status: done
owner: agent
depends_on: [D-01, B-03]
touches: [backend/src/config.ts, backend/prisma.config.ts, backend/Dockerfile]
sources: []
branch: chore/D-16-production-log-noise
pr: "#126"
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

- [x] Au démarrage du conteneur, les logs ne contiennent ni l'encadré de mise à jour de Prisma, ni les lignes `injected env` de dotenv, ni la bannière d'i18next.
- [x] Les lignes utiles restent : sauvegarde `pre-migrate-*` ou « No pending migrations », `SQLite journal mode`, `Carta Cocktail API running on port`.

## Tests à ajouter ou adapter

- Aucun test unitaire. Construire l'image, la démarrer sur un volume vide puis sur une base existante, et coller les logs dans la PR.

## Points d'attention

- `touches` recoupe D-01 (`backend/Dockerfile`) : lancer après D-01.
- dotenv : `quiet: true` fonctionne en 17 et en 18 (B-07), qui logue toujours par défaut. Préférer l'option à la variable d'environnement, dont le nom change entre les deux versions (`DOTENV_CONFIG_QUIET`, `DOTENV_QUIET`). C-15 ajoutera `import 'dotenv/config'` dans `backend/prisma.config.ts`, ce qui fera revenir la ligne `injected env` : la traiter dans C-15 ou ici, selon l'ordre.
- Ne pas couper les logs de l'entrypoint ni ceux de `prisma migrate deploy` : les notes de version s'y réfèrent.

## Journal

- 2026-10-10 : tâche créée après la mise à jour en v1.6.0 d'une instance réelle (logs collés par l'humain).
- 2026-10-12 : D-01 déplace le seed vers `backend/src/scripts/seed.ts` (`touches` mis à jour). Bruit supplémentaire vu avec l'image de D-01 : `npm notice New major version of npm available` après les `npx prisma` de l'entrypoint (le cache npm de l'utilisateur `node` est neuf) ; `ENV NPM_CONFIG_UPDATE_NOTIFIER=false` dans `backend/Dockerfile` le coupe. La ligne `injected env (0) from .env` vient maintenant de `import 'dotenv/config'` dans `backend/prisma.config.ts` (C-15).
- 2026-10-12 : fait (PR #126). `quiet: true` dans `backend/src/config.ts` et dans `backend/prisma.config.ts`, où `import 'dotenv/config'` devient `config({ quiet: true })` (fichier ajouté à `touches`). `backend/src/scripts/seed.ts` ne charge plus dotenv lui-même depuis D-01 : il passe par `src/lib/prisma.ts`, déjà en `quiet: true` ; il sort de `touches`. Avec dotenv 18.0.7, `dotenv/config` est déjà muet par défaut : la seule ligne `injected env` restante venait de `config.ts`, l'option explicite protège `prisma.config.ts` d'un changement de défaut ou de `DOTENV_QUIET`. `backend/Dockerfile` (stage `runtime`, ENV statiques à côté de `NODE_ENV`) : `NPM_CONFIG_UPDATE_NOTIFIER=false` et `CHECKPOINT_DISABLE=1`. Vérifié sur Prisma 7.10 : le check de mise à jour renvoie `disabled` et l'encadré ne s'affiche plus (il apparaissait au deuxième démarrage du même conteneur, cache du checkpoint), donc pas de `PRISMA_HIDE_UPDATE_MESSAGE`. Bannière i18next absente (B-03). Logs de l'entrypoint et de `prisma migrate deploy` inchangés. Image construite et démarrée sur un volume vide, sur une base existante et en redémarrage du même conteneur : logs avant/après dans la PR. Banc 1.4.0 → local : `friend` OK en naïf et conforme (0 bruit, lignes `pre-migrate-*`, baseline `0_init`, WAL, port trouvées) ; `official` refusé faute de hook `1.12.0` sur develop (le backend non root de D-01 refuse des volumes root, `chownMounts` non appliqué), puis OK en naïf (refus attendu) et conforme avec un hook `1.12.0` temporaire non versionné (`copyDatabase` + `chownMounts`, d'après la ligne « Notes de version » de D-01). Aucune action utilisateur.
