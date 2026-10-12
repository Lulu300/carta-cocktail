---
id: B-11
title: "Alerte deepmerge-ts dans la CLI Prisma"
phase: B
lane: deps
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [A-07, D-04]
touches: [backend/package.json, backend/package-lock.json, .github/workflows/ci.yml]
sources: ["08-dependencies.md §5"]
branch:
pr:
---

## Contexte

Après A-07, `npm audit` (dépendances de dev comprises) côté backend signale encore `deepmerge-ts` < 8.0.0 (haute, GHSA-ggr8-5vv4-36mx : épuisement de pile sur un graphe d'objets récursif). Le paquet vient de `prisma` 6.19.3 → `@prisma/config` → `deepmerge-ts` 7.1.5. `npm audit --omit=dev` ne le voit pas, parce que `prisma` est en `devDependencies`.

## Problème constaté

- `npm audit fix --force` propose de **descendre** `prisma` en 6.12.0 : à refuser.
- `@prisma/config` 7.10.0 dépend toujours de `deepmerge-ts` 7.1.5 : Prisma 7 (C-15) ne corrige pas l'alerte.
- Le Dockerfile actuel exécute la CLI Prisma au démarrage (`db push`). `deepmerge-ts` n'y fusionne que la configuration Prisma, sans entrée utilisateur. L'impact réel est faible.

## Ce qu'il faut faire

1. Vérifier si une version de `prisma` ou `@prisma/config` dépend de `deepmerge-ts` ≥ 8.
2. Sinon, évaluer une surcharge `"overrides": { "deepmerge-ts": "^8.0.2" }` dans `backend/package.json` : `npx prisma generate`, `npx prisma db push` sur une base de test et `npm test` doivent passer.
3. Si la surcharge casse la CLI, laisser l'alerte, noter la décision dans le Journal et passer la tâche en `dropped`.
4. Une fois `npm audit --omit=dev` backend à 0 high : remonter l'audit du job Backend de `.github/workflows/ci.yml` de `--audit-level=critical` à `--audit-level=high` (seuil provisoire posé par D-04, décision humaine du 2026-10-12), et mettre à jour le commentaire de l'étape.

## Critères d'acceptation

- [ ] `npm audit` backend ne signale plus `deepmerge-ts`, ou la décision de garder l'alerte est notée dans le Journal.
- [ ] `prisma generate`, `prisma db push` et les tests backend passent.
- [ ] L'étape « Audit production dependencies » du job Backend de `ci.yml` est en `--audit-level=high` et passe.

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
