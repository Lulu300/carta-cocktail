---
id: B-08
title: "Hygiène du dépôt (.gitignore, fichiers morts, métadonnées package.json)"
phase: B
lane: docs
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [.gitignore, backend/.gitignore, .env.example, backend/package.json, backend/package-lock.json]
sources: ["07-devops-history.md §1.4", "07-devops-history.md §4.3"]
branch:
pr:
---

## Contexte

Petites incohérences du dépôt. Des dossiers générés apparaissent dans `git status`, avec un risque de commit accidentel par un humain ou un agent. Une entrée `.gitignore` est obsolète, une variable d'environnement ne sert à rien, deux devDependencies sont inutilisées et les métadonnées de `backend/package.json` sont fausses (licence ISC alors que le dépôt est sous MIT). Rien de grave, mais du bruit pour chaque agent qui travaille dans le dépôt.

## Problème constaté

- `git status` au 2026-10-08 : `.omc/`, `backend/.omc/`, `frontend/.omc/`, `backend/coverage/` et `frontend/coverage/` sont non suivis et non ignorés. Le `.gitignore` racine n'a ni `.omc/` ni `coverage/`.
- `docs/plan/index.html` est censé ne pas être versionné (`docs/plan/README.md`), mais aucune règle ne l'ignore.
- `backend/.gitignore:5` : `/src/generated/prisma`, alors que le générateur `prisma-client-js` écrit dans `node_modules` (`backend/prisma/schema.prisma:1-3`). Entrée obsolète.
- `backend/prisma/dev.db` (0 octet) : déjà ignoré par `*.db` (`.gitignore:13`) et non versionné. Rien à committer, suppression locale seulement. Retiré de `touches`.
- `.env.example:8-9` : `VITE_API_URL` n'est lu nulle part ; le frontend passe par le proxy `/api` (`frontend/vite.config.ts:9-18`).
- `backend/package.json:48,51` : `nodemon` et `ts-node` ne sont utilisés par aucun script ni fichier (`dev` utilise `tsx watch`). Seule mention : `backend/AGENTS.md:151`.
- `backend/package.json:3-5,19` : `"description": ""`, `"main": "index.js"` (le vrai point d'entrée est `dist/index.js`), `"license": "ISC"` alors que `LICENSE` est MIT, pas de `"private": true`. `frontend/package.json` a déjà `"private": true` et n'a pas besoin de changer.
- `frontend/.gitignore` : rien à modifier, les règles racine suffisent. Retiré de `touches`.

## Ce qu'il faut faire

1. `.gitignore` racine, ajouter :
   ```gitignore
   # Outils locaux
   .omc/

   # Rapports de couverture
   coverage/

   # Page de suivi du plan (générée par docs/plan/build.mjs)
   docs/plan/index.html
   ```
   Ne **pas** toucher à la ligne `backend/prisma/migrations/` (l.32) : C-01 la retire.
2. `backend/.gitignore` : supprimer `/src/generated/prisma`.
3. `.env.example` : supprimer le bloc `# Frontend` et `VITE_API_URL`.
4. `backend/package.json` :
   - ajouter `"private": true`, passer `"license"` à `"MIT"`, écrire une `description` courte (ex. « API Carta Cocktail (Express + Prisma) »), supprimer `"main"` ;
   - `npm uninstall nodemon ts-node`, ce qui met à jour `package-lock.json` (y compris la licence dans `packages[""]`).
5. Supprimer localement `backend/prisma/dev.db` (aucun commit).
6. Vérifier que `git status` reste propre après les tests avec couverture et la génération de la page de suivi.

Hors périmètre : retrait de la ligne `migrations/` (C-01) ; suppression de `frontend/nginx.conf` (A-06) ; `@prisma/client` en `dependencies` et `.dockerignore` (D-01) ; `engines`, `.nvmrc` et `@types/node` (B-01) ; `.mailmap` (D-07) ; correction de `backend/AGENTS.md:151` (D-09).

## Critères d'acceptation

- [ ] Après `npm test -- --coverage` dans `backend/` et `frontend/`, puis `node docs/plan/build.mjs`, `git status` n'affiche ni `coverage/`, ni `.omc/`, ni `docs/plan/index.html`.
- [ ] `backend/.gitignore` ne contient plus `/src/generated/prisma`.
- [ ] `.env.example` ne contient plus `VITE_API_URL`.
- [ ] `backend/package.json` : `private`, licence MIT, plus de `main` ; `nodemon` et `ts-node` absents de `package.json` et du lockfile.
- [ ] `npm ci`, `npm run build`, `npm run dev` et `npm test` fonctionnent toujours dans `backend/`.

## Tests à ajouter ou adapter

Aucun code applicatif modifié, donc pas de test unitaire. Vérifications à coller dans la PR :
- `git check-ignore -v backend/coverage frontend/.omc docs/plan/index.html` : chaque chemin est ignoré par une règle du `.gitignore` racine.
- `grep -rn "nodemon\|ts-node" --exclude-dir=node_modules --exclude-dir=docs --exclude=package-lock.json .` : seule `backend/AGENTS.md` ressort (corrigée en D-09).
- `cd backend && npm ci && npm run build && npm test`.

## Points d'attention

- Le lockfile backend change : la tâche rejoint de fait le couloir `deps`. Ne pas la lancer en parallèle d'une tâche qui touche `backend/package-lock.json` (A-07, B-04, B-05, B-07, B-09, C-04, C-11, C-15…).
- `.env.example` est aussi modifié par A-04 (secrets) : enchaîner les deux.
- `.claude/` est déjà ignoré (`.gitignore:25`) : ajouter les prochains outils locaux au `.gitignore` racine plutôt que dans ceux des sous-dossiers.

## Journal

- 2026-10-08 : tâche créée à partir de la revue.
