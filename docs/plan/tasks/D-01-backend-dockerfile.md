---
id: D-01
title: "Image backend : multi-stage, non-root, sans devDependencies"
phase: D
lane: infra
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [B-01, C-01, D-10]
touches: [backend/Dockerfile, backend/package.json, backend/docker-entrypoint.sh]
sources: ["07-devops-history.md §2.5", "07-devops-history.md §2.6", "03-security.md §11"]
branch:
pr:
---

## Décisions validées (2026-10-10)

- **Version de Node** : Node 24 LTS, image de base épinglée sur une mineure comme l'a fait B-01 (`node:24.21-alpine` au 2026-10-10, ou la dernière mineure 24.x publiée au moment du travail). Remplacer les `node:24-alpine` flottants des exemples ci-dessous. Les builds locaux demandent un hôte 64 bits (pas d'image ARM 32 bits).

## Contexte

L'image backend publiée sur ghcr.io est celle qui tourne sur le NAS. Elle embarque aujourd'hui tout l'outillage de dev, tourne en root et dépend de devDependencies pour démarrer. Un build local copie en plus le `node_modules` macOS de l'hôte et le `.env` dans l'image. Cette tâche produit une image plus petite, non-root, reproductible, sans changer le comportement fonctionnel.

## Problème constaté

- `backend/Dockerfile:1-18` : un seul stage `node:20-alpine`, `npm ci` complet (`:6`), `COPY . .` (`:11`), pas de `USER`, pas de `NODE_ENV`. Node 20 est fin de vie (B-01 passe en Node 24).
- `backend/Dockerfile:18` : `CMD ["sh", "-c", "... && npm start"]`. `sh` est PID 1 et ne relaie pas SIGTERM à Node : `docker stop` attend 10 s puis tue le processus. C-01 remplace cette ligne par `docker-entrypoint.sh`.
- `backend/package.json:36` et `:49` : `@prisma/client` et `prisma` sont en devDependencies alors que le runtime les utilise (16 fichiers de `src/` importent `@prisma/client`, la CLI sert à `migrate deploy`). `npm ci --omit=dev` casserait l'application.
- `backend/package.json:14` : le seed est lancé par `tsx prisma/seed.ts`. `tsx` est une devDependency, et `tsc` ne compile pas `prisma/seed.ts` (`tsconfig.json:7,17` : `rootDir ./src`, `include src/**/*`).
- `backend/package.json:48,51` : `nodemon` et `ts-node` ne sont utilisés nulle part (`dev` utilise `tsx watch`).
- Aucun `.dockerignore` (ni racine, ni `backend/`, ni `frontend/`) : traité par D-10. En local, `backend/` contient `node_modules/` (darwin), `.env`, `dist/`, `coverage/`, `.omc/`, `prisma/carta_cocktail.db`, `prisma/dev.db`, `prisma/prisma/test.db`. Tout part dans le contexte de build.
- `tsconfig.json:17` inclut `src/**/*`, donc les `*.test.ts` et `src/test/` sont compilés dans `dist/` de l'image.

## Ce qu'il faut faire

1. Vérifier que B-01 (Node 24) et C-01 (`docker-entrypoint.sh`, `migrate deploy`) sont mergés. Partir de leur version du Dockerfile.
2. `backend/package.json` :
   - déplacer `@prisma/client` et `prisma` dans `dependencies` (même version que le lockfile) ;
   - supprimer `nodemon` et `ts-node` ;
   - ajouter `"build:seed": "tsc prisma/seed.ts --outDir dist/seed --module commonjs --target ES2022 --esModuleInterop --skipLibCheck"` ;
   - régénérer le lockfile avec `npm install` (pas de montée de version).
3. Les `.dockerignore` backend et frontend viennent de D-10 (dépendance). Ne les modifier que si le multi-stage a besoin d'un chemin qu'ils excluent ; dans ce cas, ajouter `backend/.dockerignore` à `touches` et le noter au Journal.
4. Réécrire `backend/Dockerfile` en multi-stage. Garder des tags littéraux dans les `FROM` (Dependabot ne met pas à jour un tag construit avec `ARG`, cf. D-06) :
   ```dockerfile
   FROM node:24-alpine AS deps
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci

   FROM deps AS build
   COPY prisma ./prisma
   RUN npx prisma generate
   COPY tsconfig.json ./
   COPY src ./src
   RUN npm run build && npm run build:seed

   FROM node:24-alpine AS prod-deps
   WORKDIR /app
   COPY package*.json ./
   COPY prisma/schema.prisma ./prisma/schema.prisma
   RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

   FROM node:24-alpine AS runtime
   RUN apk add --no-cache tini su-exec
   ENV NODE_ENV=production
   WORKDIR /app
   COPY --from=prod-deps /app/node_modules ./node_modules
   COPY --from=build /app/dist ./dist
   COPY package.json ./
   COPY prisma ./prisma
   COPY docker-entrypoint.sh ./
   RUN chmod +x docker-entrypoint.sh \
    && mkdir -p /app/data /app/uploads \
    && chown node:node /app/data /app/uploads
   EXPOSE 3001
   ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
   CMD ["node", "dist/index.js"]
   ```
5. Adapter `backend/docker-entrypoint.sh` (créé par C-01) : en tête, si le script tourne en root, corriger les droits des volumes puis se relancer en `node` ; à la fin, `exec "$@"`. Remplacer `npm run db:seed` par `node dist/seed/seed.js`.
   ```sh
   #!/bin/sh
   set -eu
   if [ "$(id -u)" = "0" ]; then
     for d in /app/data /app/uploads; do
       [ "$(stat -c %u "$d")" = "1000" ] || chown -R node:node "$d"
     done
     exec su-exec node "$0" "$@"
   fi
   # ... étapes de C-01 : copie de sécurité SQLite, prisma migrate deploy ...
   node dist/seed/seed.js
   exec "$@"
   ```
6. Mesurer la taille avant et après (`docker image ls`) et la noter dans la PR.

## Critères d'acceptation

- [ ] `docker build backend/` réussit depuis un checkout qui contient un `node_modules` macOS et un `.env` local.
- [ ] `docker run --rm --entrypoint sh <image> -c 'ls node_modules | grep -E "^(vitest|typescript|tsx|nodemon|ts-node)$"'` ne renvoie rien.
- [ ] `docker run --rm --entrypoint ls <image> /app` ne montre ni `.env`, ni `src`, ni base `.db`.
- [ ] Le processus Node tourne sous l'utilisateur `node` (`docker compose exec carta-cocktail-backend ps -o user,args`).
- [ ] `docker compose stop carta-cocktail-backend` rend la main en moins de 3 s.
- [ ] Le conteneur démarre sur un volume `db-data` existant créé par l'ancienne image (fichiers root) et l'admin peut se connecter.
- [ ] `npm test`, `npx tsc --noEmit` et `npm run build` passent dans `backend/`.
- [ ] Taille de l'image notée dans la PR, nettement inférieure à l'actuelle.

## Tests à ajouter ou adapter

- Pas de test Vitest : le changement est dans l'image. Vérification manuelle décrite dans la PR :
  `docker compose up --build -d`, login admin, upload d'une image, `docker compose restart`, l'image est toujours servie.
- Tester la reprise d'un volume existant : lancer l'ancienne image (`ghcr.io/lulu300/carta-cocktail/backend:1.4.0`) sur un volume neuf, l'arrêter, relancer la nouvelle image sur le même volume.
- Le job « Docker build » de D-04 vérifiera ensuite le build sur chaque PR, et le smoke test D-08 le démarrage complet.

## Points d'attention

- Les `.dockerignore` sont sortis dans D-10 (relevé en revue de la phase A) : depuis A-04, un `backend/.env` avec de vrais secrets est copié par `COPY . .` dans une couche de l'image locale, d'où il peut fuir (`docker history`, `docker save`, push) : c'est le risque réel. Le chargement de ce `/app/.env` par `config.ts` ne sert de repli qu'avec un compose personnalisé ou un simple `docker run` ; les compose du dépôt définissent toujours `JWT_SECRET` et `ADMIN_PASSWORD`, que dotenv n'écrase pas. D-10 ne dépend de rien et passe avant cette tâche.
- Volumes existants. Les fichiers de `db-data` et `uploads` appartiennent à root sur les installations actuelles. Un `USER node` sec rendrait la base en lecture seule au premier démarrage. Le `su-exec` de l'étape 5 corrige les droits puis abandonne root. Variante plus stricte à valider avec l'humain : `USER node` dans le Dockerfile et une commande `chown` manuelle documentée dans D-09. Conséquence de la variante su-exec : le conteneur démarre en root quelques millisecondes.
- Prisma sur Alpine. Si `prisma generate` ou le démarrage signalent une version de libssl introuvable, ajouter `openssl` à l'`apk add`. C-15 (Prisma 7) changera le générateur : relire ce Dockerfile à ce moment-là.
- `morgan('dev')` (`app.ts:30`) reste actif en production. Le passage à un format adapté est dans D-03, qui touche `app.ts`.
- Transmis par C-01 (revue de la PR #44) : avec `ENTRYPOINT` et sans `exec "$@"`, `docker compose run carta-cocktail-backend sh` lance l'API au lieu d'un shell (le README utilise `--entrypoint sh`). Ajouter dans l'entrypoint `if [ "$#" -gt 0 ]; then exec "$@"; fi` (ou passer par tini et un `CMD`). Tant que l'entrypoint n'a pas fait son `exec`, le shell est PID 1 et ignore SIGTERM : un `docker stop` pendant une migration longue est tué au bout de 10 s. tini (étape prévue) règle ce point ; le vérifier avec une migration lente.
- Conflits : B-01, C-01, D-05 et C-15 modifient aussi `backend/Dockerfile`. Rebaser juste avant le merge.
- **Notes de version** (règle de D-11 : la PR ne touche ni `docs/releases/` ni `UPGRADING.md`). Cette image change le comportement de démarrage pour tout utilisateur de `:latest` : changement cassant, `breaking: true`. La description de la PR a une section « Required actions » et le Journal une ligne « Notes de version ». Actions attendues, à confirmer dans la PR : *before* — sauvegarder les volumes `db-data` et `uploads` ; *after* — vérifier dans les logs que le conteneur démarre et que la base est accessible en écriture (droits corrigés par `su-exec`) ; avec un compose personnalisé qui force `user:` ou sous Docker rootless, `chown` des volumes vers l'utilisateur `node` (commande exacte dans la PR). Épinglage recommandé : `:<version>` avant D-05, `:<majeure>.<mineure>` ensuite.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-09 : suivi des revues de la phase A (PR #37). Étapes 3 et 4 (`.dockerignore`) déplacées dans la nouvelle tâche D-10, plus urgente depuis A-04 ; étape 3 remplacée par un renvoi, étapes suivantes renumérotées ; D-10 ajoutée à `depends_on`, les deux fichiers retirés de `touches` et du titre.
- 2026-10-09 : point d'attention « Notes de version » (règle de D-11 décidée le 2026-10-09) : `breaking: true`, actions attendues, épinglage recommandé.
- 2026-10-09 : C-01 (revue de la PR #44) transmet `exec "$@"` et le SIGTERM pendant les migrations (Points d'attention).
