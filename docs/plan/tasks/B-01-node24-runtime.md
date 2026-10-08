---
id: B-01
title: "Node 24 LTS partout (images Docker, engines, .nvmrc)"
phase: B
lane: infra
criticite: haute
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/Dockerfile, frontend/Dockerfile, .nvmrc, backend/package.json, frontend/package.json, AGENTS.md, README.md]
sources: ["08-dependencies.md §2", "07-devops-history.md §3.3", "03-security.md §11"]
branch:
pr:
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

- [ ] Plus aucune occurrence de `node:20` dans le dépôt (`grep -rn "node:20" --include=Dockerfile .`).
- [ ] `.nvmrc` présent, `engines` présent dans les deux paquets.
- [ ] `docker compose build` réussit pour les deux services.
- [ ] L'application démarre et le seed passe dans le conteneur backend.
- [ ] Doc alignée (AGENTS.md, README.md).

## Tests à ajouter ou adapter

Pas de test unitaire. Vérification manuelle décrite dans la PR : sortie de `docker compose build`, `docker compose exec carta-cocktail-backend node -v` → `v24.x`.

## Points d'attention

- `bcryptjs` est en JS pur : pas de module natif à recompiler aujourd'hui. Ce sera différent avec Prisma 7 (better-sqlite3, C-15) et sharp (F-01) : vérifier alors les binaires musl, surtout si le NAS est en ARM.
- Node 26 deviendra LTS fin octobre 2026. Rester sur 24 jusqu'en 2027, le temps que les modules natifs publient leurs binaires.
- Le Dockerfile backend est aussi modifié par C-01, C-15 et D-01 : enchaîner, ne pas lancer en parallèle.

## Journal

- 2026-10-08 : tâche créée à partir de la revue et du rapport de dépendances.
