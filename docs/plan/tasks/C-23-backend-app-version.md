---
id: C-23
title: "Version de l'application côté backend (metadata des sauvegardes)"
phase: C
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-05]
touches: [backend/src/services/backupService.ts, backend/src/services/backupService.test.ts, backend/src/routes/backup.test.ts, backend/Dockerfile, .github/workflows/release.yml]
sources: []
branch:
pr:
---

## Contexte

C-05 écrit `appVersion` dans le `metadata.json` des sauvegardes à partir de `backend/package.json`, comme la tâche le demandait. Ce champ vaut toujours `1.0.0` : la version de `backend/package.json` n'est jamais mise à jour, les releases sont taguées dans Git et le frontend reçoit sa version par l'argument de build `APP_VERSION` (`VITE_APP_VERSION`).

## Problème constaté

- `backend/package.json` : `"version": "1.0.0"` depuis le premier commit.
- L'image backend ne reçoit pas la version du tag (pas d'argument de build `APP_VERSION`).
- Une sauvegarde ne dit donc pas quelle version l'a produite ; seule `schemaVersion` (dernière migration) est fiable.

## Ce qu'il faut faire

1. Passer `APP_VERSION` au build de l'image backend dans `release.yml`, comme pour le frontend, et l'exposer en variable d'environnement dans le `Dockerfile`.
2. `buildMetadata` lit `process.env.APP_VERSION`, avec `package.json` (ou `dev`) en repli hors image.
3. Option à trancher : tenir `version` à jour dans les deux `package.json` à chaque release (D-11) plutôt qu'un argument de build.

## Critères d'acceptation

- [ ] Une sauvegarde exportée par une image `vX.Y.Z` porte `appVersion: "X.Y.Z"`.
- [ ] En dev, `appVersion` reste renseignée (repli).

## Tests à ajouter ou adapter

- `backupService.test.ts` : `APP_VERSION` défini, puis absent.

## Points d'attention

- Touche `Dockerfile` et `release.yml` : à enchaîner avec les tâches D qui modifient ces fichiers (D-01).
- L'import ne lit pas `appVersion` : seule `schemaVersion` sert à la compatibilité.

## Journal

- 2026-10-11 : tâche créée par C-05 (`appVersion` toujours à `1.0.0`).
- 2026-10-12 : l'étape 1 est faite par D-05 (PR #118) : `release.yml` passe `APP_VERSION` aux deux images et `backend/Dockerfile` l'expose en variable d'environnement (`dev` par défaut hors release). Décision de l'humain pour D-05 : `APP_VERSION` fait foi, les `package.json` ne bougent pas (l'étape 3 est donc tranchée contre la synchronisation). Reste `buildMetadata` : lire `process.env.APP_VERSION`, avec `dev` en repli. L'idée de passer les deux `package.json` à `0.0.0`, pour que `1.0.0` ne passe pas pour une vraie version, est à trancher dans cette tâche.
- 2026-10-12 : relecture de D-03 (PR #117) : `/api/health` lit déjà `process.env.APP_VERSION || 'dev'` (`backend/src/routes/health.ts`). Extraire une seule fonction de version, utilisée par la route health et par `buildMetadata`, plutôt que deux lectures.
