---
id: A-07
title: "Dépendances lot 1 : correctifs de sécurité et mises à jour mineures"
phase: A
lane: deps
criticite: haute
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/package.json, backend/package-lock.json, frontend/package.json, frontend/package-lock.json]
sources: ["08-dependencies.md §1", "08-dependencies.md §5", "03-security.md §9", "07-devops-history.md §4.1"]
branch:
pr:
---

## Contexte

Les lockfiles n'ont pas bougé depuis le 23 février. `npm audit --omit=dev` remonte 11 vulnérabilités en production côté backend (2 critiques) et 2 hautes côté frontend. Presque toutes se corrigent sans montée majeure. C'est le « lot 1 » du rapport de dépendances : la base propre sur laquelle les autres lots s'appuient.

## Problème constaté

Audit du 2026-10-08 (`npm audit --omit=dev`) :

| Paquet | Sévérité | Correctif |
|---|---|---|
| `i18next-http-middleware` 3.9.2 (direct, backend) | critique | 3.9.9 |
| `proxy-addr` (via express) | critique | `npm audit fix` |
| `multer` 2.0.2 (direct, backend) | haute | 2.4.0 |
| `path-to-regexp`, `lodash`, `minimatch`, `brace-expansion` (transitifs) | haute | `npm audit fix` |
| `morgan` 1.10.1 (direct), `qs`, `body-parser` | modérée / basse | 1.12.1, `npm audit fix` |
| `adm-zip` 0.5.16 (direct) | haute | **0.6.1, majeure** → traité dans B-07 |
| `react-router` / `react-router-dom` 7.13.0 (frontend) | haute | 7.18.4 |

Autres points relevés dans `backend/package.json` :
- `nodemon` et `ts-node` ne sont utilisés nulle part (`dev` utilise `tsx watch`).
- `@types/node` est en ^25 côté backend et ^24 côté frontend alors que le runtime est Node 24.
- `prisma@latest` pointe sur `8.0.0-rc.22` : un `npm install prisma@latest` installerait un RC.

## Ce qu'il faut faire

1. **Backend** (`cd backend`) :
   - `npm update` (reste dans les ranges du `package.json`) ;
   - épingler `prisma` et `@prisma/client` sur `6.19.3` (ne surtout pas suivre `latest`) ;
   - `npm install i18next-http-middleware@^3.9.9 multer@^2.4.0 morgan@^1.12.1 helmet@^8.3.0` ;
   - `npm audit fix` **sans `--force`** ;
   - `npm uninstall nodemon ts-node` ;
   - `npm install -D @types/node@^24`.
2. **Frontend** (`cd frontend`) :
   - `npm update`, puis `npm install react-router-dom@^7.18.4` ;
   - versions attendues après coup : react/react-dom 19.3, vite 7.3.7, @vitejs/plugin-react 5.2.0, tailwindcss 4.3.3, typescript-eslint 8.71.1, eslint-plugin-react-hooks 7.1.1, vitest 4.1.11, i18next 25.10.10, react-i18next 16.6.6, jszip 3.10.2 ;
   - `npm audit fix` sans `--force` ;
   - `npm install -D @types/node@^24`.
3. Lancer dans chaque paquet : `npx tsc --noEmit` (frontend : `npx tsc -b --noEmit`), `npm run lint` (frontend), `npm run build`, `npm test -- --coverage`.
4. Relancer `npm audit --omit=dev` et coller le résultat dans la PR.

## Critères d'acceptation

- [ ] `npm audit --omit=dev` backend : seules restent les alertes `adm-zip` (traitées par B-07).
- [ ] `npm audit --omit=dev` frontend : 0 vulnérabilité.
- [ ] Aucune montée majeure dans le diff des `package.json` (vérifier chaque ligne).
- [ ] `prisma` et `@prisma/client` en 6.19.3 exactement.
- [ ] `nodemon` et `ts-node` absents de `backend/package.json`.
- [ ] Build, lint, `tsc` et tests verts dans les deux paquets, seuils de couverture inchangés.

## Tests à ajouter ou adapter

Aucun nouveau test : la suite existante sert de filet. Si un test casse, corriger le code (pas le test) sauf si le test dépendait d'un comportement interne d'une librairie ; l'expliquer dans la PR.

## Points d'attention

- Ne pas lancer `npm audit fix --force` : il monterait `adm-zip` en 0.6 sans les tests prévus dans B-07.
- `react-i18next` 16.6.6 exige `i18next >= 25.10.9` : les deux doivent monter ensemble.
- `backend/AGENTS.md` cite encore `ts-node` : la correction de doc est faite dans D-09, ne pas la faire ici.
- Les PR de dépendances se font une à la fois par paquet (lockfiles). Cette tâche bloque B-04, B-05, B-07 et B-09.

## Journal

- 2026-10-08 : tâche créée à partir de la revue et du rapport de dépendances.
