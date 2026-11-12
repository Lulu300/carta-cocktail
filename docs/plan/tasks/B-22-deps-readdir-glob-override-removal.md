---
id: B-22
title: "Retirer la surcharge readdir-glob → minimatch quand archiver la rend inutile"
phase: B
lane: deps
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [B-20]
touches: [backend/package.json, backend/package-lock.json]
sources: []
branch:
pr:
---

## Contexte

B-20 (PR #164) a ajouté dans `backend/package.json` la surcharge `"overrides": { "readdir-glob": { "minimatch": "^11.0.1" } }`. Elle corrige l'avis `moderate` GHSA-g3hv-75wg-m249 (`minimatch` 7.0.0 à 11.0.0) sur le chemin de production `archiver` → `readdir-glob` → `minimatch`. Au 2026-11-12 :

- `archiver` 8.0.0, dernière version publiée, demande `readdir-glob ^3.0.0` ;
- `readdir-glob` 3.0.0 demande `minimatch ^10.2.2` ; `readdir-glob` 4.0.0 (2026-11-09) demande `minimatch ^11.0.1`, avec un `dist/` identique à celui de 3.0.0 ;
- le lockfile installe `minimatch` 11.0.8 sous `node_modules/readdir-glob/node_modules/minimatch`, et garde `minimatch` 10.2.6 à la racine pour le dev (`eslint`).

B-16 a suivi de la même façon le retrait des surcharges posées par B-11.

## Problème constaté

- Une surcharge reste active après les montées de version : si un futur `readdir-glob` demande `minimatch` 12, la surcharge lui impose 11 sans le dire. Dependabot n'ouvre pas de mise à jour de version npm tant que D-21 n'est pas faite.
- Retirer la ligne de `package.json` ne suffit pas. La relecture de la PR #164 l'a vérifié sur une copie : après le retrait, `npm install` (ou `--package-lock-only`) garde l'entrée imbriquée `minimatch` 11.0.8, `npm ls` la signale `invalid: "^10.2.2"` et `npm audit --omit=dev` reste à 0, ce qui masque le retour de l'avis. Il faut supprimer l'entrée `node_modules/readdir-glob/node_modules/minimatch` du lockfile puis réinstaller.

## Ce qu'il faut faire

1. Condition de départ, à vérifier avec `npm view archiver version dependencies` et `npm view readdir-glob version dependencies` : une version stable d'`archiver` dépend de `readdir-glob` ≥ 4, ou une version de `readdir-glob` compatible avec la borne d'`archiver` dépend de `minimatch` ≥ 11.0.1. Sinon, ajouter une ligne datée au Journal et laisser la tâche en `todo`.
2. Sur une copie de `backend/` : monter `archiver` si besoin, retirer la surcharge de `package.json`, supprimer l'entrée `node_modules/readdir-glob/node_modules/minimatch` de `package-lock.json`, puis `npm install`. Contrôler `npm ls minimatch readdir-glob archiver` (aucun `invalid`) et `npm audit --omit=dev` (0 avis).
3. Si le contrôle passe, refaire la même chose dans le dépôt ; le lockfile doit être identique à celui de la copie. Lire les notes de version d'`archiver` en cas de montée.
4. Vérifier l'image : `docker build` du backend (étage `prod-deps` et coupes D-30 de `backend/docker/prune-unused-deps.mjs`), puis un export de sauvegarde par l'API dans le conteneur.

## Critères d'acceptation

- [ ] `backend/package.json` n'a plus de surcharge `readdir-glob`.
- [ ] `package-lock.json` n'a plus d'entrée `node_modules/readdir-glob/node_modules/minimatch` imposée par la surcharge, et `npm ls minimatch readdir-glob archiver` ne signale aucun `invalid`.
- [ ] `npm audit --omit=dev` backend reste à 0 avis.
- [ ] `npm ci`, `tsc`, lint, build et `npm test` passent ; jobs « Docker build (backend) » et Smoke verts.

## Tests à ajouter ou adapter

Aucun si aucune ligne de code ne change : `backup.test.ts` passe par `archiver` pour l'export ZIP. La relecture de la PR #164 a montré qu'un `minimatch` sans export `Minimatch` fait échouer ce fichier dès l'import d'`archiver` ; aucun test ne construit de motif, car `backup.ts` appelle `archive.directory()` sans motif.

## Points d'attention

- `build.mjs --ready` la donne prête dès que B-20 est faite : la condition de départ, externe, ne se vérifie qu'à l'étape 1.
- D-21 (réactiver Dependabot npm après la phase B) n'attend pas cette tâche : B-22 peut rester `todo` longtemps, en attente d'`archiver`, sans bloquer la fin de la phase B pour D-21 (B-22 n'est pas dans ses `depends_on`). Même situation que B-16 en son temps.
- Une seule tâche à la fois sur `backend/package-lock.json`.
- Ne pas passer sur une pré-version d'`archiver` pour retirer la surcharge.
- Pas de `npm audit fix --force` (il propose de descendre `archiver` en 7.0.1) ; ne pas baisser le seuil de l'audit dans `ci.yml`.
- Le `minimatch` 10.2.6 de la racine sert au dev (`eslint`, `@eslint/config-array`, `typescript-eslint`) : il n'est pas concerné par cette tâche.

## Journal

- 2026-11-12 : tâche créée par la PR docs de suivi du lot D-35/E-18/B-20/C-12 à partir de la relecture de la PR #164 (B-20). Condition de retrait et entrée de lockfile vérifiées sur `develop` (9799168) : surcharge présente, `archiver` 8.0.0 → `readdir-glob ^3.0.0`, `readdir-glob` 3.0.0 → `minimatch ^10.2.2`, entrée imbriquée `minimatch` 11.0.8 ; sur le registre, `archiver` 8.0.0 et `readdir-glob` 4.0.0 sont toujours les dernières versions.
