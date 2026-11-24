---
id: D-47
title: "Veille Prisma 8 : montée groupée de Prisma et de better-sqlite3 quand la 8.0.0 stable sort"
phase: D
lane: deps
criticite: basse
effort: M
status: todo
owner: agent
depends_on: [C-15, D-21]
touches: [backend/package.json, backend/package-lock.json, .github/dependabot.yml]
sources: []
branch:
pr:
---

## Contexte

D-21 a réactivé les mises à jour de version npm de Dependabot. Les majeures de `prisma`, `@prisma/client`, `@prisma/adapter-better-sqlite3` et `better-sqlite3` restent dans `ignore` de `.github/dependabot.yml`, avec un renvoi vers cette tâche :

- les trois paquets Prisma doivent monter ensemble (CLI, client généré et adapter à la même version) ; une majeure proposée par Dependabot arriverait en trois PR séparées ;
- `better-sqlite3` reste dans la plage de dépendance de `@prisma/adapter-better-sqlite3` (`^12.6.0` en 7.10.1) : une version 13 au premier niveau laisserait l'adapter avec un `better-sqlite3` 12 imbriqué, soit deux modules natifs ;
- une majeure de Prisma touche aussi la surcharge `"@prisma/config": { "effect": "^3.22.1" }` de B-24 (suivie dans B-22) et les coupes de l'image backend (D-30, `backend/docker/prune-unused-deps.mjs`).

Au 2026-11-25 : `prisma@latest` = 8.0.0-rc.35 (2026-11-23), la ligne stable 7.10.1 est sous le dist-tag `prev` ; `@prisma/client@latest` et `@prisma/adapter-better-sqlite3@latest` = 7.10.1 ; l'adapter n'a aucune version 8 publiée ; `better-sqlite3@latest` = 13.2.0. Dependabot ne propose pas la rc (il écarte les pré-versions tant que la version actuelle est stable, même quand `latest` en désigne une).

## Problème constaté

Sans tâche, l'`ignore` de D-21 masquerait Prisma 8 et `better-sqlite3` 13 indéfiniment.

## Ce qu'il faut faire

1. Condition de départ : `prisma`, `@prisma/client` et `@prisma/adapter-better-sqlite3` ont une 8.x stable (`npm view <paquet> dist-tags`, `npm view <paquet> versions`). Sinon : ligne datée au Journal, tâche laissée en `todo`.
2. Lire le guide de migration et les notes de version de Prisma 8. Monter les trois paquets à la même version (épinglée, comme en 7), et `better-sqlite3` à la majeure que demande l'adapter. Vérifier `npm ls better-sqlite3` (une seule version) et `npm ls effect` ; retirer la surcharge `effect` si `@prisma/config` 8 la rend inutile (règle de B-22 et B-24).
3. Contrôles de C-15 : `npm ci`, `tsc`, lint, tests, `npm run db:check`, image backend (étage `prod-deps`, coupes D-30, `prisma --version`), smoke compose, banc de mise à jour sur une base existante.
4. Retirer de `.github/dependabot.yml` les entrées `ignore` de ces quatre paquets si la tâche les rend inutiles (ou les garder avec un nouveau renvoi), puis `check-jsonschema --builtin-schema vendor.dependabot .github/dependabot.yml`.

## Critères d'acceptation

- [ ] Prisma (CLI, client, adapter) sur la même version 8.x stable ; une seule version de `better-sqlite3`.
- [ ] `npm audit --omit=dev --audit-level=high` à 0 ; `npm ci`, `tsc`, lint, tests, build, image backend et smoke verts.
- [ ] `.github/dependabot.yml` à jour et valide.

## Tests à ajouter ou adapter

La suite backend existante (adapter, transactions sérialisées, migrations) ; des tests seulement si Prisma 8 change un comportement utilisé.

## Points d'attention

- `build.mjs --ready` la donne prête dès que ses dépendances sont faites : la condition, externe, ne se vérifie qu'à l'étape 1 (même situation que B-22).
- Ne pas passer sur une pré-version.
- Une seule tâche à la fois sur `backend/package-lock.json`.
- Une majeure de Prisma peut changer le générateur ou `prisma.config.ts` : si la montée dépasse les fichiers de `touches`, découper ou élargir en le notant au Journal.

## Journal

- 2026-11-25 : tâche créée par D-21 pour suivre les majeures de Prisma et de `better-sqlite3` ignorées par Dependabot.
