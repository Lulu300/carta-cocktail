---
id: D-10
title: ".dockerignore backend et frontend : plus de secrets ni de node_modules de l'hôte dans les images"
phase: D
lane: infra
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/.dockerignore, frontend/.dockerignore]
sources: ["07-devops-history.md §2.5"]
branch:
pr:
---

## Contexte

Les deux Dockerfiles font `COPY . .` sans `.dockerignore`. Lors d'un build local (`docker compose up --build`), tout le dossier part dans l'image. Depuis A-04, le README fait créer `backend/.env` avec un vrai `JWT_SECRET` et un vrai `ADMIN_PASSWORD` : ces secrets finissent dans une couche de l'image. Ce correctif tenait dans D-01 (étapes 3 et 4), qui attend B-01 et C-01. Il est sorti dans cette tâche pour être livré tout de suite, sans dépendance.

## Problème constaté

- Aucun `.dockerignore` (ni racine, ni `backend/`, ni `frontend/`). `backend/Dockerfile` et `frontend/Dockerfile` (stage de build) font `COPY . .`.
- `backend/.env` (créé par `cp ../.env.example .env`, README, section installation locale) est copié dans `/app/.env`. Le secret reste lisible dans la couche, même s'il est remplacé au runtime : `docker history`, un `docker save` ou un push de l'image locale vers un registre le divulgue.
- `config.ts` charge en plus `path.resolve(__dirname, '../.env')`, soit `/app/.env`. Avec les deux compose du dépôt, ce repli ne joue pas : `JWT_SECRET` est obligatoire (`${JWT_SECRET:?…}`) et `ADMIN_PASSWORD` est toujours défini (`${ADMIN_PASSWORD:-}`, chaîne vide), or dotenv n'écrase pas une variable déjà définie. Il ne joue qu'avec un compose personnalisé ou un simple `docker run` sans `-e` : l'image démarre alors silencieusement avec les secrets du poste de build.
- Le `node_modules` de l'hôte (macOS) écrase celui installé par `npm ci` dans l'image (`.prisma/client` généré pour darwin, binaires natifs esbuild et rollup) : build Vite en échec ou moteur Prisma introuvable selon les cas.
- Partent aussi dans le contexte : `prisma/*.db`, `prisma/prisma/test.db`, `coverage/`, `dist/`, `.omc/`.
- Les images publiées par `release.yml` partent d'un checkout propre : elles ne sont pas concernées.

## Ce qu'il faut faire

1. Créer `backend/.dockerignore` :
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
2. Créer `frontend/.dockerignore` : `node_modules`, `dist`, `coverage`, `.env*`, `.omc`, `.DS_Store`. Ne pas exclure les tests : `tsc -b` les compile et un import manquant casserait le build.
3. Ne modifier aucun Dockerfile : la refonte reste dans D-01.

## Critères d'acceptation

- [ ] `docker build backend/` et `docker build frontend/` réussissent depuis un checkout qui contient un `node_modules` macOS et un `backend/.env`.
- [ ] `docker run --rm --entrypoint ls <image backend> -a /app` ne montre ni `.env`, ni base `.db`, ni `coverage`.
- [ ] `docker run --rm --entrypoint find <image backend> /app/src -name '*.test.ts' -o -path '/app/src/test'` ne renvoie rien.
- [ ] `docker compose up --build -d` puis connexion admin : l'application fonctionne comme avant.

## Tests à ajouter ou adapter

- Pas de test Vitest : le changement porte sur le contexte de build. Vérification manuelle décrite dans la PR (commandes des critères ci-dessus).
- Le job « Docker build » de D-04 et le smoke test D-08 couvriront ensuite le build à chaque PR.

## Points d'attention

- Le backend compile `src/**/*` (`tsconfig.json`). Exclure `src/test` et les `*.test.ts` du contexte suppose qu'aucun fichier hors test n'importe `src/test/` : vrai au 2026-10-09, à revérifier.
- Un secret déjà présent dans une image locale construite avant cette tâche y reste : la PR rappelle de supprimer ces images (`docker image rm`) et de changer `JWT_SECRET` si l'une d'elles a été poussée ou partagée.
- D-01 dépend de cette tâche et réécrit ensuite le Dockerfile backend en multi-stage autour de ces fichiers.

## Journal

- 2026-10-09 : tâche créée en revue de la PR #37 (suivis de la phase A), à partir des étapes 3 et 4 de D-01, pour livrer les `.dockerignore` sans attendre B-01 et C-01.
