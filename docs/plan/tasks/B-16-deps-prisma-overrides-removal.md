---
id: B-16
title: "Retirer les surcharges deepmerge-ts et mysql2 quand Prisma les corrige"
phase: B
lane: deps
criticite: basse
effort: S
status: done
owner: agent
depends_on: [B-11]
touches: [backend/package.json, backend/package-lock.json, .github/workflows/ci.yml, docs/plan/tasks/B-20-deps-audit-moderate-cleanup.md]
sources: ["08-dependencies.md §5"]
branch: chore/B-16-deps-prisma-overrides-removal
pr: "#150"
---

## Contexte

B-11 a ajouté dans `backend/package.json` les surcharges `"overrides": { "deepmerge-ts": "^8.0.2", "mysql2": "^3.24.5" }` : `prisma` 7.10.0 (dépendance d'exécution depuis D-01) épingle `mysql2` 3.15.3 et `@prisma/config` 7.10.0 épingle `deepmerge-ts` 7.1.5, tous deux visés par des avis `high`. Le commentaire de l'étape « Audit production dependencies » du job Backend de `ci.yml` renvoie à cette tâche.

## Problème constaté

- Une surcharge reste active après les montées de version : si une future `prisma` demande `deepmerge-ts` 9 ou `mysql2` 4, la surcharge l'en empêche sans le dire.
- Au 2026-10-12, seules des pré-versions corrigent : `@prisma/config` 8.1.0-dev dépend de `deepmerge-ts` 8.0.2, et `prisma` 8 n'existe qu'en `8.0.0-rc`.

## Ce qu'il faut faire

1. À chaque montée de `prisma` (Dependabot ignore les majeures de Prisma : montée manuelle), tester chaque surcharge séparément, sans se fier à `npm view … dependencies` : à partir de Prisma 8, les dépendances passent par d'autres paquets (`@prisma/orm-toolchain`…), et `deepmerge-ts` ou `mysql2` peut même sortir de l'arbre.
2. Pour une surcharge : sur une copie de `backend/`, la retirer de `package.json`, régénérer le lockfile (`npm install --package-lock-only`), puis lancer `npm ls deepmerge-ts mysql2` et `npm audit --omit=dev`. S'il reste une alerte `high` ou plus, garder la surcharge. Sinon, la retirer dans le dépôt et régénérer le lockfile.
3. Mettre à jour le commentaire de l'étape d'audit du job Backend de `ci.yml`.

## Critères d'acceptation

- [x] `backend/package.json` n'a plus de surcharge inutile.
- [x] `npm audit --omit=dev` backend reste à 0 `high`, `prisma generate`, `prisma migrate deploy` et les tests backend passent.
- [x] Le commentaire de l'étape d'audit de `ci.yml` ne cite plus les surcharges retirées.

## Tests à ajouter ou adapter

Aucun : la suite backend utilise la CLI Prisma pour créer la base de test.

## Points d'attention

- Ne pas passer sur une pré-version de Prisma (`8.0.0-rc`, `dev`) pour retirer une surcharge.
- Ne jamais baisser le seuil de l'audit dans `ci.yml`.
- Une seule tâche à la fois sur `backend/package-lock.json`.

## Journal

- 2026-10-12 : tâche créée par B-11 (surcharges posées en attendant une version stable de Prisma qui corrige).
- 2026-10-13 : depuis D-30 (PR #138), l'étage `prod-deps` de `backend/Dockerfile` coupe des arêtes du graphe de dépendances de la CLI Prisma (`backend/docker/prune-unused-deps.mjs`) et se termine par `prisma --version`. Une arête qui n'existe plus ou un paquet coupé que la CLI charge arrête le build. Si la correction passe par une montée de version de Prisma, la liste des coupes du `Dockerfile` peut devoir changer : vérifier le job « Docker build (backend) » et le Smoke, et ajouter `backend/Dockerfile` aux `touches` le cas échéant. D-30 a vérifié que sa solution ne dépend pas des surcharges (même résultat avec un lockfile régénéré sans elles).
- 2026-11-05 : fait dans la PR #150. `prisma`, `@prisma/client` et `@prisma/adapter-better-sqlite3` passent de 7.10.0 à 7.10.1 (version stable du 2026-10-15, toujours en version exacte) ; le tag `latest` de npm (8.0.0-rc.30) est ignoré. Procédure de l'étape 2 sur des copies de `backend/` après la montée : chaque surcharge retirée seule, puis les deux. Dans tous les cas, `deepmerge-ts` est en 8.0.2 (via `@prisma/config` 7.10.1), `mysql2` en 3.24.4 sans sa surcharge (via `prisma` 7.10.1), et `npm audit --omit=dev` compte 0 `high`. Les deux surcharges sont retirées ; le lockfile du dépôt est identique à celui de la copie sans surcharge. `mysql2` 3.24.4 est désormais imbriqué sous `node_modules/prisma/node_modules/` (placement choisi par npm, que `npm dedupe` ne change pas). `pkg-types` 2.4.0, `exsolve` 1.2.0 et `confbox` 0.3.2 sont re-résolus avec `@prisma/config`, et `@prisma/engines-version` passe à `8.1.0-1.d1b3f377…` (moteur de schéma livré par 7.10.1). Notes de version lues. Le client ne modifie plus l'objet d'options d'un `$transaction` imbriqué : sans effet ici, nous n'imbriquons pas et ne passons pas d'options. Migrate refuse (`P3025`) une base fantôme égale à la base principale : nous n'en configurons pas, `db:check` et le contrôle de baseline de l'entrypoint utilisent la base fantôme en mémoire de SQLite. Vérifié en local : `db:check` ne trouve aucune différence ; sur une base créée par `0_init` seule, le diff sort en 0, puis `migrate resolve` et `migrate deploy` appliquent les 3 migrations suivantes. Aucun changement visible, pas d'action requise. La liste des coupes de `backend/Dockerfile` (D-30) ne change pas : l'arête `prisma:mysql2` existe toujours, et `@prisma/dev` 0.24.17 comme `@prisma/studio-core` 0.33.0 restent en place. `npm ci`, `prisma generate`, `prisma migrate deploy` sur une base vide, `db:check`, `tsc`, lint (0 erreur, 25 avertissements, comme sur `develop`), build et `npm test` (couverture 99,23 / 95,03 / 99,81 / 99,54 %) passent. `npm audit --omit=dev` : 0 `high` et 5 `moderate`, avant comme après (14 `moderate` avec le dev). Commentaire de l'étape d'audit de `ci.yml` mis à jour, seuil inchangé. Ligne ajoutée au Journal de B-20 (fichier ajouté à `touches`).
