---
id: D-33
title: "npm 12 : autoriser explicitement les scripts d'installation des dépendances (allowScripts)"
phase: D
lane: infra
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/package.json, frontend/package.json, backend/Dockerfile, frontend/Dockerfile, .github/workflows/ci.yml, backend/AGENTS.md, frontend/AGENTS.md]
sources: []
branch:
pr:
---

## Contexte

Relevé par la relecture de la PR Dependabot #142 (image backend en `node:24.22-alpine`, npm 11.19.1). Pendant `npm ci` et `npm prune`, npm 11.19 affiche `install-scripts N packages have install scripts not yet covered by allowScripts`. Le même avertissement existait déjà sur `develop` avec npm 11.19.0.

npm 12 (`latest` sur le registre npm, 12.2.2 au 2026-11-05) bloque par défaut les scripts d'installation des dépendances qui ne figurent pas dans le champ `allowScripts` du `package.json` (`npm help install-scripts`). Vérifié par le coordinateur le 2026-11-05 : `npx npm@12.2.2 install better-sqlite3@12` dans un projet vide installe le paquet **sans** son binaire (`build/Release/*.node` absent) et termine par `install-scripts 1 package had install scripts blocked`. Les scripts du projet lui-même (`postinstall: prisma generate`) ne sont pas concernés.

Dépendances avec un script d'installation dans les lockfiles (2026-11-05) :

- backend : `better-sqlite3` (prod, binaire natif via `prebuild-install`), `prisma` et `@prisma/engines` (prod, moteurs), `esbuild` (dev), `fsevents` (dev, optionnel, macOS) ;
- frontend : `msw` (dev), `fsevents` (dev, optionnel, macOS).

## Problème constaté

- Aujourd'hui, Node 24 embarque npm 11 : les scripts tournent encore, dans les images comme en CI. Mais le jour où l'image de base ou la CI passe à npm 12, l'image backend perd le binaire de `better-sqlite3` et les moteurs Prisma. L'échec n'apparaît pas à l'installation (simple avertissement) : la construction peut réussir et donner une image qui ne démarre pas.
- Un développeur qui a déjà installé npm 12 en global obtient dès maintenant un `backend/node_modules` sans binaire `better-sqlite3`, avec une erreur au premier accès à la base.

## Ce qu'il faut faire

1. Lister, avec npm 12 (`npx npm@12 install-scripts ls` dans `backend/` et `frontend/` après `npm ci`), les paquets dont le script est nécessaire, et justifier chacun (`fsevents` inutile en conteneur Linux et en CI : à refuser ou laisser hors liste, au choix motivé).
2. Les déclarer dans `allowScripts` de chaque `package.json` (forme écrite par `npm install-scripts approve`, version épinglée ou nom seul : choisir et justifier au regard des montées Dependabot, qui changent la version à chaque PR).
3. Vérifier que npm 11 (celui de Node 24, des images et de la CI) accepte ce champ sans changement de comportement.
4. Ajouter un garde qui échoue tôt si un script nécessaire n'a pas tourné : dans `backend/Dockerfile`, un contrôle explicite du binaire `better-sqlite3` à côté du `prisma --version` existant de l'étage `prod-deps` (D-30), et en CI une étape équivalente (ou `npm install-scripts ls` qui doit être vide), sans dépendre de la version de npm installée.
5. Documenter la règle dans `backend/AGENTS.md` et `frontend/AGENTS.md` : une nouvelle dépendance avec script d'installation doit être ajoutée à `allowScripts`.

## Critères d'acceptation

- [ ] `npm ci` avec npm 12 dans `backend/` et `frontend/` : aucun script nécessaire bloqué ; le binaire `better-sqlite3` et le client Prisma sont présents ; `npm test` passe.
- [ ] `npm ci` avec npm 11 (CI, images) : comportement inchangé.
- [ ] L'image backend construite avec npm 12 dans l'étage `prod-deps` (essai local, par exemple `npm i -g npm@12` temporaire dans un Dockerfile de test) démarre ; sans l'entrée `allowScripts` de `better-sqlite3`, le build échoue sur le nouveau garde.
- [ ] Règle documentée dans les deux `AGENTS.md`.

## Tests à ajouter ou adapter

Pas de test unitaire : le garde du `Dockerfile` et l'étape de CI en tiennent lieu. Sonde de sabotage attendue dans la PR : retirer `better-sqlite3` de `allowScripts`, construire avec npm 12, le build doit échouer.

## Points d'attention

- Ne pas passer les images ou la CI à npm 12 dans cette tâche : seulement les rendre prêtes.
- Une seule tâche à la fois sur un `package.json` donné (lockfiles et champs partagés) ; `backend/Dockerfile` est aussi touché par les tâches d'image (règle du README : enchaîner).
- `npm install-scripts approve` n'existe pas en npm 11 : écrire le champ à la main ou avec `npx npm@12`, puis vérifier avec npm 11.

## Journal

- 2026-11-05 : tâche créée par la PR docs de suivi du lot E-15/B-13/C-42/B-19/B-16, à partir de la relecture de la PR Dependabot #142 (avertissement npm `allowScripts`). Décision de l'humain : « Create a task ».
