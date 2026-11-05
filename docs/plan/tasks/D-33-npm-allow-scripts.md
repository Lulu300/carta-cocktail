---
id: D-33
title: "npm 12 : autoriser explicitement les scripts d'installation des dépendances (allowScripts)"
phase: D
lane: infra
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/package.json, frontend/package.json, backend/Dockerfile, backend/AGENTS.md, frontend/AGENTS.md]
sources: []
branch:
pr:
---

## Contexte

Relevé par la relecture de la PR Dependabot #142 (image backend en `node:24.22-alpine`, npm 11.19.1). Pendant `npm ci` et `npm prune`, npm 11.19 affiche `install-scripts N packages have install scripts not yet covered by allowScripts`. Le même avertissement existait déjà sur `develop` avec npm 11.19.0.

npm 12 (`latest` sur le registre npm, 12.2.2 au 2026-11-05) bloque par défaut les scripts d'installation des dépendances qui ne figurent pas dans le champ `allowScripts` du `package.json` (`npm help install-scripts`). Vérifié par le coordinateur le 2026-11-05 : `npx npm@12.2.2 install better-sqlite3@12` dans un projet vide installe le paquet **sans** son binaire (`build/Release/*.node` absent) et termine par `install-scripts 1 package had install scripts blocked`. Les scripts du projet lui-même (`postinstall: prisma generate`) ne sont pas concernés.

Dépendances avec un script d'installation dans les lockfiles (2026-11-05) :

- backend : `better-sqlite3` (prod, binaire natif via `prebuild-install`), `@prisma/engines` (prod, téléchargement du moteur de schéma), `prisma` (prod, `preinstall` qui contrôle seulement la version de Node), `esbuild` (dev), `fsevents` (dev, optionnel, macOS) ;
- frontend : `msw` (dev, `postinstall` sans effet tant que `msw.workerDirectory` n'est pas défini dans `frontend/package.json`), `fsevents` (dev, optionnel, macOS).

Relecture de la PR #151 (essais avec `npx npm@…`) :

- Sans son script, seul `better-sqlite3` est vraiment perdu (`Could not locate the bindings file`). Le moteur de `@prisma/engines` est retéléchargé par le `postinstall` du projet (`prisma generate`), qui a le réseau pendant le `npm ci` de l'image. `esbuild` fonctionne sans son `postinstall`.
- npm 11.19.1 (celui de `node:24.22-alpine` et de la CI, `.nvmrc` = 24) connaît déjà `npm install-scripts ls|approve|deny` et le champ `allowScripts`. Une entrée `true` n'y change rien sauf l'avertissement. Une entrée `false` y est **déjà appliquée** : le script est bloqué. Les npm 11 plus anciens (11.9.0, Node 24.14) ne connaissent pas la commande.
- Aucune version de Node n'embarque npm 12 au 2026-11-05 : Node 24.22.2 a npm 11.19.1, Node 26.13.0 LTS (2026-10-28) a npm 11.20.0. npm 12 n'arrive que par une installation globale manuelle.

## Problème constaté

- Aujourd'hui, Node embarque npm 11 : les scripts tournent encore, dans les images comme en CI. Le jour où l'image de base ou la CI passe à npm 12, l'image backend perd le binaire de `better-sqlite3`. L'échec n'apparaît pas à l'installation (simple avertissement) : sans garde, la construction peut réussir et donner une image qui ne démarre pas.
- Un développeur qui a installé npm 12 en global obtient dès maintenant un `backend/node_modules` sans binaire `better-sqlite3`, avec une erreur explicite au premier accès à la base (les tests backend échouent).

## Ce qu'il faut faire

1. Lister (`npm install-scripts ls` dans `backend/` et `frontend/` après `npm ci`) les paquets dont le script est nécessaire, et justifier chacun. Attention : une entrée `false` (refus) bloque déjà le script sous npm 11.19.1. Refuser `fsevents` changerait donc le comportement actuel sur macOS : le laisser hors liste ou le refuser, au choix motivé.
2. Les déclarer dans `allowScripts` de chaque `package.json`. Règles de npm 12.2.2 (`npm help install-scripts`) : `approve` écrit par défaut des clés épinglées (`pkg@x.y.z`), `--no-allow-scripts-pin` des clés sans version ; les plages semver sont refusées. Une clé épinglée qui ne correspond plus à la version installée bloque le script sous npm 12 sans faire échouer l'installation, alors que npm 11 ne fait qu'avertir : après une montée Dependabot, une CI en npm 11 ne le verrait pas. Choisir la forme (clés sans version, ou garde exécuté avec npm 12) en conséquence et le justifier.
3. Vérifier qu'avec npm 11.19.1 (images, CI) le comportement reste celui d'aujourd'hui (binaire `better-sqlite3` présent, plus d'avertissement).
4. Ajouter un garde qui échoue tôt si le binaire `better-sqlite3` manque : dans `backend/Dockerfile`, à côté du `prisma --version` existant de l'étage `prod-deps` (D-30). En CI, `npm test` échoue déjà sans ce binaire ; une étape de plus n'est utile que si elle vérifie les entrées avec npm 12 (alors ajouter `.github/workflows/ci.yml` aux `touches`).
5. Documenter la règle dans `backend/AGENTS.md` et `frontend/AGENTS.md` : une nouvelle dépendance dont le script est nécessaire doit être ajoutée à `allowScripts`.

## Critères d'acceptation

- [ ] `npm ci` avec npm 12 dans `backend/` et `frontend/` : aucun script nécessaire bloqué ; le binaire `better-sqlite3` et le client Prisma sont présents ; `npm test` passe.
- [ ] `npm ci` avec npm 11.19.1 (CI, images) : comportement inchangé.
- [ ] L'image backend construite avec npm 12 dans l'étage `prod-deps` (essai local, par exemple `npm i -g npm@12` temporaire dans un Dockerfile de test) démarre ; sans l'entrée `allowScripts` de `better-sqlite3`, le build échoue sur le nouveau garde.
- [ ] Règle documentée dans les deux `AGENTS.md`.

## Tests à ajouter ou adapter

Pas de test unitaire : le garde du `Dockerfile` et l'étape de CI en tiennent lieu. Sonde de sabotage attendue dans la PR : retirer `better-sqlite3` de `allowScripts`, construire avec npm 12, le build doit échouer.

## Points d'attention

- Ne pas passer les images ou la CI à npm 12 dans cette tâche : seulement les rendre prêtes.
- Une seule tâche à la fois sur un `package.json` donné (lockfiles et champs partagés) ; `backend/Dockerfile` est aussi touché par les tâches d'image (règle du README : enchaîner).
- `npm install-scripts` existe en npm 11.19.1 mais pas dans les npm 11 plus anciens (11.9.0) : vérifier avec la version de npm des images et de la CI.
- npm 12.2.2 déclare `engines.node` `^22.22.2 || ^24.15.0 || >=26.0.0` : l'essai fonctionne sur `node:24.22-alpine` ; sur un poste en Node 24 < 24.15, npm 12 marche mais affiche `EBADENGINE`.
- `msw` n'a pas besoin de son script (pas de `msw.workerDirectory`) ; ne pas l'autoriser sans raison.

## Journal

- 2026-11-05 : tâche créée par la PR docs de suivi du lot E-15/B-13/C-42/B-19/B-16, à partir de la relecture de la PR Dependabot #142 (avertissement npm `allowScripts`). Décision de l'humain : « Create a task ». Faits npm 11.19.1 / npm 12, portée réelle (seul `better-sqlite3`) et `touches` corrigés après la relecture de la PR #151. Criticité : décision de l'humain « basse » (aucune version de Node n'embarque npm 12 à ce jour).
