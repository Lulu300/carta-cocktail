---
id: F-07
title: "Veille TypeScript : étape 6.0 puis passage à TypeScript 7"
phase: F
lane: deps
criticite: basse
effort: M
status: todo
owner: agent
depends_on: [B-05, B-06, C-15]
touches: [backend/package.json, backend/package-lock.json, frontend/package.json, frontend/package-lock.json, backend/tsconfig.json, frontend/tsconfig.app.json, frontend/tsconfig.node.json]
sources: ["08-dependencies.md §3.5", "08-dependencies.md §5"]
branch:
pr:
---

## Décisions validées (2026-10-08)

- **TypeScript** : faire l'étape 1 (TypeScript 6.0) une fois C-15 (Prisma 7) mergée. L'étape 2 (TypeScript 7) attend le support de typescript-eslint.

## Contexte

TypeScript 7 (compilateur natif en Go, 8 à 12 fois plus rapide) est sorti en juillet 2026, mais l'outillage ne suit pas encore : typescript-eslint accepte `typescript < 6.1` et n'a pas de calendrier pour la 7. La montée est donc **bloquée** pour le frontend. On peut en revanche préparer le terrain avec TypeScript 6.0, qui transforme en avertissements ce que la 7 rendra bloquant.

## Problème constaté

- `backend/tsconfig.json` : `"module": "commonjs"` sans `moduleResolution` (donc `node10`, déprécié en 6.0, erreur en 7.0) et sans `types` (le nouveau défaut `types: []` ferait disparaître `process`, `__dirname`, `Buffer`).
- `frontend/tsconfig.app.json` / `tsconfig.node.json` : déjà en `moduleResolution: bundler`, `strict`, `types` explicites. Peu d'impact.
- typescript-eslint 8.71 : peer `typescript >=4.8.4 <6.1.0`.

## Ce qu'il faut faire

**Étape 1 (faisable dès que les dépendances sont prêtes) : TypeScript 6.0.3**
1. `npm install -D typescript@~6.0.3` dans les deux paquets.
2. Backend : passer à `"module": "node20"` (émet du CommonJS pour un paquet `type: commonjs`) ou `"moduleResolution": "bundler"` avec `module: commonjs`, et ajouter `"types": ["node"]`. Ne pas utiliser `ignoreDeprecations`.
3. `tsc --noEmit` / `tsc -b --noEmit`, build, tests.

**Étape 2 (attendre) : TypeScript 7**
- Condition de départ : typescript-eslint publie un peer incluant `typescript ^7` (suivre l'issue typescript-eslint#12518) et TS 7.1 apporte l'API programmatique.
- Option intermédiaire : un job CI non bloquant `npx @typescript/native-preview --noEmit` (ou `tsgo`) pour mesurer le gain.

## Critères d'acceptation

- [ ] Étape 1 : TS 6.0.x dans les deux paquets, aucun avertissement de dépréciation, build et tests verts.
- [ ] Étape 2 : seulement quand les conditions ci-dessus sont réunies ; sinon la tâche reste `todo` avec une ligne de Journal datée à chaque vérification.

## Tests à ajouter ou adapter

Aucun : le compilateur et la suite existante suffisent.

## Points d'attention

- Étape 1 validée : elle se fait après C-15 (déjà dans `depends_on`).
- tsx, Vite et Vitest transpilent sans `tsc` : ils ne dépendent pas de la version de TypeScript. Seuls `tsc -b` (build frontend), `tsc` (build backend) et typescript-eslint en dépendent.

## Journal

- 2026-10-08 : tâche créée à partir du rapport de dépendances. Statut : étape 2 bloquée par typescript-eslint.
- 2026-10-08 : décisions validées par l'humain (voir « Décisions validées »).
