---
id: D-01
title: "Image backend : multi-stage, non-root, sans devDependencies, .dockerignore"
phase: D
lane: infra
criticite: moyenne
effort: M
status: todo
owner: agent
depends_on: [B-01, C-01]
touches: [backend/Dockerfile, backend/.dockerignore, frontend/.dockerignore, backend/package.json, backend/docker-entrypoint.sh]
sources: ["07-devops-history.md §2.5", "07-devops-history.md §2.6", "03-security.md §11"]
branch:
pr:
---

## Contexte

L'image backend publiée sur ghcr.io est celle qui tourne sur le NAS. Elle embarque aujourd'hui tout l'outillage de dev, tourne en root et dépend de devDependencies pour démarrer. Un build local copie en plus le `node_modules` macOS de l'hôte et le `.env` dans l'image. Cette tâche produit une image plus petite, non-root, reproductible, sans changer le comportement fonctionnel.

## Problème constaté

- `backend/Dockerfile:1-18` : un seul stage `node:20-alpine`, `npm ci` complet (`:6`), `COPY . .` (`:11`), pas de `USER`, pas de `NODE_ENV`. Node 20 est fin de vie (B-01 passe en Node 24).
- `backend/Dockerfile:18` : `CMD ["sh", "-c", "... && npm start"]`. `sh` est PID 1 et ne relaie pas SIGTERM à Node : `docker stop` attend 10 s puis tue le processus. C-01 remplace cette ligne par `docker-entrypoint.sh`.
- `backend/package.json:36` et `:49` : `@prisma/client` et `prisma` sont en devDependencies alors que le runtime les utilise (16 fichiers de `src/` importent `@prisma/client`, la CLI sert à `migrate deploy`). `npm ci --omit=dev` casserait l'application.
- `backend/package.json:14` : le seed est lancé par `tsx prisma/seed.ts`. `tsx` est une devDependency, et `tsc` ne compile pas `prisma/seed.ts` (`tsconfig.json:7,17` : `rootDir ./src`, `include src/**/*`).
- `backend/package.json:48,51` : `nodemon` et `ts-node` ne sont utilisés nulle part (`dev` utilise `tsx watch`).
- Aucun `.dockerignore` (ni racine, ni `backend/`, ni `frontend/`). En local, `backend/` contient `node_modules/` (darwin), `.env`, `dist/`, `coverage/`, `.omc/`, `prisma/carta_cocktail.db`, `prisma/dev.db`, `prisma/prisma/test.db`. Tout part dans le contexte de build.
- `tsconfig.json:17` inclut `src/**/*`, donc les `*.test.ts` et `src/test/` sont compilés dans `dist/` de l'image.

## Ce qu'il faut faire

1. Vérifier que B-01 (Node 24) et C-01 (`docker-entrypoint.sh`, `migrate deploy`) sont mergés. Partir de leur version du Dockerfile.
2. `backend/package.json` :
   - déplacer `@prisma/client` et `prisma` dans `dependencies` (même version que le lockfile) ;
   - supprimer `nodemon` et `ts-node` ;
   - ajouter `"build:seed": "tsc prisma/seed.ts --outDir dist/seed --module commonjs --target ES2022 --esModuleInterop --skipLibCheck"` ;
   - régénérer le lockfile avec `npm install` (pas de montée de version).
3. Créer `backend/.dockerignore` :
   ```
   node_modules
   dist
   coverage
   .env*
   *.db
   *.db-journal
   prisma/prisma
   .omc
   .DS_Store
   **/*.test.ts
   src/test
   vitest.config.ts
   ```
4. Créer `frontend/.dockerignore` : `node_modules`, `dist`, `coverage`, `.env*`, `.omc`, `.DS_Store`. Ne pas exclure les tests : `tsc -b` les compile et un import manquant casserait le build.
5. Réécrire `backend/Dockerfile` en multi-stage. Garder des tags littéraux dans les `FROM` (Dependabot ne met pas à jour un tag construit avec `ARG`, cf. D-06) :
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
6. Adapter `backend/docker-entrypoint.sh` (créé par C-01) : en tête, si le script tourne en root, corriger les droits des volumes puis se relancer en `node` ; à la fin, `exec "$@"`. Remplacer `npm run db:seed` par `node dist/seed/seed.js`.
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
7. Mesurer la taille avant et après (`docker image ls`) et la noter dans la PR.

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

- **`.dockerignore` plus urgent depuis A-04** (relevé en revue). Le README fait maintenant créer `backend/.env` avec un vrai `JWT_SECRET` et un vrai `ADMIN_PASSWORD`. Un `docker compose up --build` local (contexte `./backend`) le copie dans l'image par `COPY . .`, et `config.ts` le charge au démarrage (`path.resolve(__dirname, '../.env')`, soit `/app/.env`) : les secrets sont figés dans une couche de l'image et servent de valeurs par défaut silencieuses si le compose ne les fournit pas. Les images publiées par `release.yml` partent d'un checkout propre et ne sont pas touchées. Si D-01 attend encore B-01 et C-01, livrer d'abord les étapes 3 et 4 (les deux `.dockerignore`, sans autre changement) dans une petite PR séparée, qui ne dépend de rien.
- Volumes existants. Les fichiers de `db-data` et `uploads` appartiennent à root sur les installations actuelles. Un `USER node` sec rendrait la base en lecture seule au premier démarrage. Le `su-exec` de l'étape 6 corrige les droits puis abandonne root. Variante plus stricte à valider avec l'humain : `USER node` dans le Dockerfile et une commande `chown` manuelle documentée dans D-09. Conséquence de la variante su-exec : le conteneur démarre en root quelques millisecondes.
- Prisma sur Alpine. Si `prisma generate` ou le démarrage signalent une version de libssl introuvable, ajouter `openssl` à l'`apk add`. C-15 (Prisma 7) changera le générateur : relire ce Dockerfile à ce moment-là.
- `morgan('dev')` (`app.ts:30`) reste actif en production. Le passage à un format adapté est dans D-03, qui touche `app.ts`.
- Conflits : B-01, C-01, D-05 et C-15 modifient aussi `backend/Dockerfile`. Rebaser juste avant le merge.
- Cette image change le comportement de démarrage pour tout utilisateur de `:latest`. Le signaler dans les notes de la release suivante (cf. D-05).

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
- 2026-10-08 : suivi des revues de la phase A. Point d'attention ajouté : `.dockerignore` plus urgent depuis A-04 (`backend/.env` avec de vrais secrets copié dans l'image locale par `COPY . .`), livrable à part avant le reste de la tâche.
