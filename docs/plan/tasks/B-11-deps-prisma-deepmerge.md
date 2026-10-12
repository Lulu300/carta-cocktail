---
id: B-11
title: "Alerte deepmerge-ts dans la CLI Prisma"
phase: B
lane: deps
criticite: basse
effort: S
status: done
owner: agent
depends_on: [A-07, D-04]
touches: [backend/package.json, backend/package-lock.json, .github/workflows/ci.yml, docs/plan/tasks/B-16-deps-prisma-overrides-removal.md]
sources: ["08-dependencies.md §5"]
branch: chore/B-11-deps-prisma-deepmerge
pr: "#130"
---

## Contexte

Après A-07, `npm audit` (dépendances de dev comprises) côté backend signale encore `deepmerge-ts` < 8.0.0 (haute, GHSA-ggr8-5vv4-36mx : épuisement de pile sur un graphe d'objets récursif). Le paquet vient de `prisma` 6.19.3 → `@prisma/config` → `deepmerge-ts` 7.1.5. `npm audit --omit=dev` ne le voit pas, parce que `prisma` est en `devDependencies`.

## Problème constaté

- `npm audit fix --force` propose de **descendre** `prisma` en 6.12.0 : à refuser.
- `@prisma/config` 7.10.0 dépend toujours de `deepmerge-ts` 7.1.5 : Prisma 7 (C-15) ne corrige pas l'alerte.
- Le Dockerfile actuel exécute la CLI Prisma au démarrage (`db push`). `deepmerge-ts` n'y fusionne que la configuration Prisma, sans entrée utilisateur. L'impact réel est faible.

## Ce qu'il faut faire

1. Vérifier si une version de `prisma` ou `@prisma/config` dépend de `deepmerge-ts` ≥ 8.
2. Sinon, évaluer une surcharge `"overrides": { "deepmerge-ts": "^8.0.2", "mysql2": "^3.24.5" }` dans `backend/package.json` : `npx prisma generate`, `npx prisma db push` sur une base de test et `npm test` doivent passer.
3. Si la surcharge casse la CLI, laisser l'alerte, noter la décision dans le Journal et passer la tâche en `dropped`.
4. Une fois `npm audit --omit=dev` backend à 0 high : remonter l'audit du job Backend de `.github/workflows/ci.yml` de `--audit-level=critical` à `--audit-level=high` (seuil provisoire posé par D-04, décision humaine du 2026-10-12), et mettre à jour le commentaire de l'étape.

## Critères d'acceptation

- [x] `npm audit` backend ne signale plus `deepmerge-ts` ni `mysql2`, ou la décision de garder l'alerte est notée dans le Journal.
- [x] `prisma generate`, `prisma db push` et les tests backend passent.
- [x] L'étape « Audit production dependencies » du job Backend de `ci.yml` est en `--audit-level=high` et passe.

## Tests à ajouter ou adapter

Aucun : la suite backend utilise la CLI Prisma pour créer la base de test.

## Points d'attention

- Ne pas lancer `npm audit fix --force`.
- Avis publié en cours de route (l'audit CI passe au rouge sur des PR qui n'y touchent pas) : ouvrir une PR de montée de version ou de surcharge (`overrides`) ; ne jamais baisser le seuil de l'audit dans `ci.yml`.
- Une seule tâche à la fois sur `backend/package-lock.json` (B-04, B-05, B-07, B-09, C-15).

## Journal

- 2026-10-08 : tâche créée par A-07 après l'audit complet du backend.
- 2026-10-12 : relecture de C-15 (PR #103) : la CLI Prisma 7 amène `mysql2@3.15.3` (GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3), jamais utilisé avec SQLite ; `npm audit` backend passe de 3 à 4 `high`. À traiter avec l'alerte deepmerge-ts.
- 2026-10-12 : D-01 (PR #108) passe `prisma` dans `dependencies` (la CLI applique les migrations au démarrage) : `npm audit --omit=dev` voit désormais les 4 `high` (`mysql2`, `deepmerge-ts`). La CLI était déjà dans l'image avant D-01 ; le risque réel ne change pas, mais l'alerte apparaît maintenant dans l'audit de production.
- 2026-10-12 : relecture de D-04 (PR #112). Essai hors dépôt : les surcharges `"overrides": { "deepmerge-ts": "^8.0.2", "mysql2": "^3.24.5" }` ramènent `npm audit --omit=dev` à 0, avec `prisma generate`, `prisma db push` et `prisma migrate diff --from-migrations … --exit-code` verts (tests non lancés). `@prisma/config` 7.10.0 et `prisma` 7.10.0 épinglent `deepmerge-ts` 7.1.5 et `mysql2` 3.15.3 : aucune 7.x ne corrige. `npm audit fix --force` propose maintenant `prisma@6.19.3` : à refuser. B-08 est mergée (#110) et ne bloque plus. D-04 pose l'audit en CI (frontend `high`, backend `critical`) : étape 4 et critère ajoutés pour remonter le backend à `high`, `ci.yml` ajouté à `touches`, D-04 à `depends_on`.
- 2026-10-12 : relecture de D-04 (PR #112, seconde passe) : l'étape 2 et le premier critère ne citaient que `deepmerge-ts`, alors que le seuil `high` de l'étape 4 exige aussi la surcharge `mysql2`. Ajoutée aux deux.
- 2026-10-12 : fait dans la PR #130. Revérification : avis GitHub inchangés (`deepmerge-ts` < 8.0.0 corrigé en 8.0.0 ; `mysql2` < 3.22.0 (high) et ≤ 3.23.0 (moderate) corrigés en 3.22.0 et 3.23.1). Dernières versions : `deepmerge-ts` 8.0.2, `mysql2` 3.24.5. Aucune `prisma` stable ne corrige : 7.10.0 (`prev`) épingle `mysql2` 3.15.3, `@prisma/config` 7.10.0 (`latest`) épingle `deepmerge-ts` 7.1.5 ; seules `prisma` 8.0.0-rc (tag `latest` de npm) et `@prisma/config` 8.1.0-dev passent à `deepmerge-ts` 8.0.2. Surcharges `"deepmerge-ts": "^8.0.2"` et `"mysql2": "^3.24.5"` posées : `npm audit --omit=dev` passe de 4 high à 0 (audit complet aussi), audit backend de `ci.yml` remonté à `--audit-level=high`. `prisma generate`, `tsc`, build, `db:check`, lint (0 erreur), `npm test` (1096 tests) et `prisma db push` sur une base vide passent. Copie temporaire de la base du jeu d'essai réel (v1.4.0) : P3005, baseline `0_init`, 3 migrations appliquées, schéma à jour, `integrity_check` ok ; l'image backend démarre sur une autre copie (`/api/health` 200). Effet de bord : `mysql2` ≥ 3.20 déclare `@types/node` en pair obligatoire, qui passe dans l'image d'exécution (+0,5 Mo). Retrait des surcharges quand Prisma corrigera en version stable : B-16 créée (ajoutée à `touches`).
