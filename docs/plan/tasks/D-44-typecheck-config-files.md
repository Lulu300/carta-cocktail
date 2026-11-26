---
id: D-44
title: "Vérifier le typage des fichiers de configuration (vitest.config.ts, prisma.config.ts)"
phase: D
lane: ci
criticite: basse
effort: S
status: done
owner: agent
depends_on: []
touches: [frontend/tsconfig.node.json, backend/tsconfig.config.json, backend/package.json]
sources: []
branch: chore/D-44-typecheck-config-files
pr: 257
---

## Contexte

La CI vérifie les types avec `npx tsc -b` (frontend) et `npx tsc --noEmit` (backend). Un fichier TypeScript qu'aucun `tsconfig` n'inclut n'est jamais vérifié : une erreur de type n'y apparaît qu'à l'exécution, ou jamais.

## Problème constaté

Relevé par D-09 le 2026-11-24, sur `develop` :

- `frontend/tsconfig.node.json` n'inclut que `vite.config.ts` ; `frontend/tsconfig.app.json` n'inclut que `src`. `frontend/vitest.config.ts` n'est donc vérifié par aucun des deux.
- `backend/tsconfig.json` n'inclut que `src/**/*` : `backend/vitest.config.ts` et `backend/prisma.config.ts` ne sont pas vérifiés.

Vitest et le CLI Prisma chargent ces fichiers sans vérifier leurs types.

## Ce qu'il faut faire

1. Vérifier d'abord que ces fichiers compilent sans erreur avec les options du projet (un `tsconfig` temporaire suffit).
2. Frontend : ajouter `vitest.config.ts` à `include` de `tsconfig.node.json`.
3. Backend : faire vérifier `vitest.config.ts` et `prisma.config.ts` sans les compiler dans `dist/` (par exemple un `tsconfig` dédié en `noEmit`, lancé par la CI), car `npm run build` compile tout ce que `tsconfig.json` inclut.
4. Mettre à jour la commande de typage dans `ci.yml` et les `AGENTS.md` si elle change.

## Critères d'acceptation

- [ ] Une erreur de type volontaire dans chacun des trois fichiers fait échouer la commande de typage de la CI.
- [ ] `npm run build` du backend ne produit rien de plus dans `dist/`.

## Tests à ajouter ou adapter

- Aucun test automatisé : vérification par une erreur volontaire, annulée avant le commit.

## Points d'attention

- `prisma.config.ts` importe `src/lib/databasePath.ts`, seul fichier source copié dans l'image : ne pas changer son chemin.

## Journal

- 2026-11-24 : tâche créée par D-09 (hors périmètre de la synchronisation de la documentation).
- 2026-11-26 : faite. `backend/tsconfig.config.json` (noEmit) vérifie `vitest.config.ts` et `prisma.config.ts` via `npm run typecheck`, utilisé par la CI ; `vitest.config.ts` du frontend rejoint `tsconfig.node.json`. Sonde : une erreur de type dans chacun des trois fichiers fait échouer la commande ; `dist/` inchangé.
