---
id: B-01
title: "Node 24 LTS partout (images Docker, engines, .nvmrc)"
phase: B
lane: infra
criticite: haute
effort: S
status: done
owner: agent
depends_on: []
touches: [backend/Dockerfile, frontend/Dockerfile, .nvmrc, backend/package.json, frontend/package.json, backend/package-lock.json, frontend/package-lock.json, AGENTS.md, README.md, docs/plan/tasks/A-07-deps-security-patches.md]
sources: ["08-dependencies.md §2", "07-devops-history.md §3.3", "03-security.md §11"]
branch: chore/B-01-node24-runtime
pr: "#53"
---

## Contexte

Les deux images Docker tournent sur `node:20-alpine`. Node 20 est en fin de vie depuis le 30 avril 2026 et ne reçoit plus de correctifs de sécurité. La CI teste déjà sur Node 24 : on livre donc un runtime différent de celui qu'on teste. Plusieurs montées prévues exigent Node ≥ 22 (Vitest 5, jest-dom 7, better-sqlite3 pour Prisma 7). C'est le « lot 0 » du rapport de dépendances.

## Problème constaté

- `backend/Dockerfile:1` et `frontend/Dockerfile:1` : `FROM node:20-alpine`.
- `.github/workflows/ci.yml` : `node-version: 24`.
- Aucun champ `engines` dans `backend/package.json` ni `frontend/package.json`, pas de `.nvmrc`.
- `AGENTS.md` annonce « Node 20 » pour la CI, `README.md` annonce « Node 20+ ».

Calendrier Node au 2026-10-08 : 20 EOL ; 22 en maintenance jusqu'en avril 2027 ; **24 Active LTS jusqu'au 20 octobre 2026 puis maintenance jusqu'en avril 2028** ; 26 devient LTS le 28 octobre 2026.

## Ce qu'il faut faire

1. `backend/Dockerfile` et `frontend/Dockerfile` (stage de build) : `FROM node:24-alpine`, épinglé sur une mineure (ex. `node:24.14-alpine`) pour des builds reproductibles. Ne pas restructurer les Dockerfiles ici (multi-stage, non-root : D-01 et D-02).
2. Créer `.nvmrc` à la racine avec `24`.
3. Ajouter dans les deux `package.json` :
   ```json
   "engines": { "node": ">=22.13" }
   ```
   (22.13 est le minimum commun de jsdom 29, Vitest 5 et ESLint 10.)
4. Mettre à jour les mentions de version dans `AGENTS.md` (section CI/CD) et `README.md` (prérequis).
5. Construire les deux images localement : `docker compose build`, puis `docker compose up` et vérifier que l'app répond (login, carte publique).

## Critères d'acceptation

- [x] Plus aucune occurrence de `node:20` dans le dépôt (`grep -rn "node:20" --include=Dockerfile .`).
- [x] `.nvmrc` présent, `engines` présent dans les deux paquets.
- [x] `docker compose build` réussit pour les deux services.
- [x] L'application démarre et le seed passe dans le conteneur backend.
- [x] Doc alignée (AGENTS.md, README.md).

## Tests à ajouter ou adapter

Pas de test unitaire. Vérification manuelle décrite dans la PR : sortie de `docker compose build`, `docker compose exec carta-cocktail-backend node -v` → `v24.x`.

## Points d'attention

- `bcryptjs` est en JS pur : pas de module natif à recompiler aujourd'hui. Ce sera différent avec Prisma 7 (better-sqlite3, C-15) et sharp (F-01) : vérifier alors les binaires musl, surtout si le NAS est en ARM.
- Node 26 deviendra LTS fin octobre 2026. Rester sur 24 jusqu'en 2027, le temps que les modules natifs publient leurs binaires.
- Le Dockerfile backend est aussi modifié par C-01, C-15 et D-01 : enchaîner, ne pas lancer en parallèle.
- Depuis A-07, le lockfile backend doit rester installable par `npm ci` sous npm 10 (image `node:20-alpine`) : entrée `node_modules/@prisma/config/node_modules/magicast` 0.3.5, que npm 11 peut retirer. Une fois les images en Node 24 (npm 11), retirer cette contrainte du Journal d'A-07 et des tâches qui la citent.

## Journal

- 2026-10-08 : tâche créée à partir de la revue et du rapport de dépendances.
- 2026-10-10 : fait dans la PR #53. Images en `node:24.21-alpine` (Node 24.21.0, npm 11.19.0, dernière mineure publiée), `.nvmrc` à `24`, `engines.node` `>=22.13` dans les deux paquets, AGENTS.md et README.md alignés. Écarts : les deux lockfiles reçoivent seulement l'entrée `engines` de leur racine (ajoutés à `touches`), sans la normalisation de npm 11 (retrait de `magicast` côté backend, entrées `oxide-wasm32-wasi` côté frontend) ; `npm ci` passe sous npm 11.19 (image) et npm 10.9 (Node 22). Contrainte npm 10 levée par une ligne datée dans le Journal d'A-07 (fichier ajouté à `touches`), sans réécrire l'historique. Vérifications : `docker compose build`, `docker compose up` sur volumes neufs (`0_init` appliquée, seed OK, `node -v` → `v24.21.0`), connexion, carte publique, `/api/public/*` en 200. Banc de mise à jour `1.4.0,1.6.0,local` en mode conformant, layouts `friend` et `official` : OK, aucun échec inattendu. Il faut `--local-version 1.7.0` : avec la valeur par défaut (1.6.0), le banc refuse le saut `1.6.0 → local`. Sur Apple Silicon, les images `local` sont construites en `linux/arm64`. Il reste à l'humain de décider s'il garde `>=22.13` : un futur `npm install` sous npm 11 retirera l'entrée `magicast`, et `npm ci` échouera alors sous Node 22 (npm 10).
- 2026-10-10 : Notes de version : les images backend et le stage de build frontend passent de Node 20 (fin de vie) à Node 24 LTS (`node:24.21-alpine`). Aucune action pour l'utilisateur.
