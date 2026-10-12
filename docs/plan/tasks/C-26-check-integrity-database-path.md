---
id: C-26
title: "check-integrity : réutiliser resolveDatabasePath"
phase: C
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-05]
touches: [backend/src/scripts/check-integrity.ts, backend/src/services/backupService.ts]
sources: []
branch: chore/D-01-backend-dockerfile
pr: "#108"
---

## Contexte

C-05 ajoute `resolveDatabasePath(url)` dans `backend/src/services/backupService.ts`. La fonction transforme une `DATABASE_URL` `file:` en chemin de fichier comme le fait Prisma : elle retire la query string et résout un chemin relatif depuis `prisma/`. Relevé à la revue de la PR #76 (remarque 7).

## Problème constaté

- `backend/scripts/check-integrity.ts` (`databaseFileExists`) refait la même conversion à la main : `url.replace(/^file:/, '').split('?')[0]`, puis `path.resolve(__dirname, '../prisma', file)`.
- Deux implémentations d'une même règle peuvent diverger. Par exemple, `resolveDatabasePath` refuse une URL qui n'est pas `file:`, alors que le script renvoie seulement « fichier introuvable ».

## Ce qu'il faut faire

1. Faire appeler `resolveDatabasePath()` par `databaseFileExists`, et garder le contrôle `fs.existsSync`.
2. Si le script ne doit pas dépendre d'un service de sauvegarde, déplacer `resolveDatabasePath` dans un module partagé (`src/lib/`), puis l'importer depuis `backupService.ts` et depuis le script.

## Critères d'acceptation

- [x] Une seule implémentation de la conversion URL → chemin.
- [x] `check-integrity` garde son message « Database file not found » pour un fichier absent.

## Tests à ajouter ou adapter

- Les tests de `resolveDatabasePath` (`backupService.test.ts`) suivent la fonction si elle est déplacée.

## Points d'attention

- `scripts/` n'est pas dans `tsconfig.json` (`rootDir: src`) : il tourne avec `tsx`, et `UPGRADING.md` le lance dans l'image (`--entrypoint npx … tsx scripts/check-integrity.ts`). Il importe déjà `src/services/integrityService` ; garder cette commande fonctionnelle.

## Journal

- 2026-10-11 : tâche créée à partir de la revue de la PR #76 (C-05).
- 2026-10-12 : faite par D-01 (PR #108). Le script passe dans `backend/src/scripts/check-integrity.ts` (compilé dans `dist/`, lancé par `node dist/scripts/check-integrity.js` dans l'image) et `databaseFileExists` appelle `resolveDatabasePath()` de `src/lib/databasePath.ts` (déjà partagé avec `backupService.ts` depuis C-15). Message « Database file not found » et code 2 conservés ; test ajouté pour un chemin qui désigne un dossier.
