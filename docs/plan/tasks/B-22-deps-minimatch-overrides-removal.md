---
id: B-22
title: "Retirer les surcharges minimatch (backend et frontend) quand leurs parents acceptent minimatch 11"
phase: B
lane: deps
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [B-20, B-21, B-23]
touches: [backend/package.json, backend/package-lock.json, frontend/package.json, frontend/package-lock.json]
sources: []
branch:
pr:
---

## Décisions validées

- 2026-11-12, humain : la surcharge `minimatch` de l'outillage de dev du frontend (B-21) se suit ici (« dans les deux cas, étendre B-22 au frontend »). Puis, à la question de la relecture de la PR #170 sur le `minimatch` de dev du backend : « Task run in this batch » (B-23, même surcharge ciblée qu'au frontend, suivie ici aussi).

## Contexte

L'avis `moderate` GHSA-g3hv-75wg-m249 touche `minimatch` 7.0.0 à 11.0.0 ; le correctif est en 11.0.1. Trois groupes de surcharges `"minimatch": "^11.0.1"` le corrigent :

- backend, production : `"readdir-glob"` (B-20, PR #164), sur le chemin `archiver` → `readdir-glob` → `minimatch` ;
- backend, dev : `"eslint"`, `"@eslint/config-array"`, `"@typescript-eslint/typescript-estree"` (B-23, PR #172) ;
- frontend, dev : les trois mêmes (B-21, PR #170).

Au 2026-11-12 :

- `archiver` 8.0.0, dernière version publiée, demande `readdir-glob ^3.0.0` ; `readdir-glob` 3.0.0 demande `minimatch ^10.2.2` ; `readdir-glob` 4.0.0 (2026-11-09) demande `minimatch ^11.0.1`, avec un `dist/` identique à celui de 3.0.0 ;
- les dernières versions des parents de dev demandent toujours `^10` : `eslint` 10.14.0 (`^10.2.6`), `@eslint/config-array` 0.23.5 (`^10.2.4`), `@typescript-eslint/typescript-estree` 8.72.2 (`^10.2.2`) ;
- depuis B-23, `backend/package-lock.json` n'a plus d'entrée `node_modules/readdir-glob/node_modules/minimatch` : `minimatch` 11.0.8 est une seule entrée `node_modules/minimatch`, de production, partagée par `readdir-glob` et l'outillage de dev. Au frontend, `node_modules/minimatch` 11.0.8 est de dev.

B-16 a suivi de la même façon le retrait des surcharges posées par B-11.

## Problème constaté

- Une surcharge reste active après les montées de version : si un futur parent demande `minimatch` 12, la surcharge lui impose 11 sans le dire. Dependabot n'ouvre pas de mise à jour de version npm tant que D-21 n'est pas faite.
- Le masquage relevé par la relecture de la PR #164 (après le retrait de la surcharge `readdir-glob`, entrée imbriquée 11.0.8 gardée `invalid`, audit muet) ne se reproduit plus depuis B-23. Relecture de la PR #172, sur des copies du lockfile : tout retrait prématuré fait revenir un `minimatch` 10.2.6 imbriqué, et `npm audit` signale de nouveau GHSA-g3hv-75wg-m249. Ces avis sont `moderate` : l'étape d'audit de la CI (`npm audit --omit=dev --audit-level=high`) reste verte. Seul le contrôle `npm audit` à la main le montre.

## Ce qu'il faut faire

1. Conditions, chacune vérifiée seule ; une entrée dont le parent demande encore `^10` reste en place :
   - `readdir-glob` (backend) : une version stable d'`archiver` dépend de `readdir-glob` ≥ 4, ou une version de `readdir-glob` compatible avec la borne d'`archiver` dépend de `minimatch` ≥ 11.0.1 (`npm view archiver version dependencies`, `npm view readdir-glob version dependencies`) ;
   - `eslint`, `@eslint/config-array`, `@typescript-eslint/typescript-estree` (backend et frontend) : une version stable du parent, dans la plage installée ou après sa montée, déclare `minimatch` ≥ 11.0.1 (`npm view <paquet> dependencies.minimatch`).

   Aucune condition remplie : ligne datée au Journal, tâche laissée en `todo`.
2. Sur une copie du paquet : monter le parent si besoin, retirer de `overrides` l'entrée ou les entrées dont la condition est remplie (le bloc entier s'il devient vide), puis `npm install`. Ne supprimer aucune entrée du lockfile à la main, ne pas lancer de `npm dedupe` nu ni de `npm audit fix --force`. Condition remplie : `node_modules/minimatch` 11.x reste la seule entrée `minimatch`, et le lockfile ne change pas au-delà de la montée du parent. Un `minimatch` 10.x imbriqué qui apparaît veut dire que la condition n'est pas remplie : remettre l'entrée. Au frontend, `--package-lock-only` ajoute des entrées `@tailwindcss/oxide-wasm32-wasi/node_modules/*` (bruit de npm 11.9) : ne pas les garder.
3. Contrôles : `npm ls minimatch` (une seule version 11.x, aucun `invalid`), `npm audit` **et** `npm audit --omit=dev` à 0, puis `npm ci`, lint (même liste de fichiers), `tsc` (`npx tsc --noEmit` au backend, `npx tsc -b` au frontend), `npm test`, build (et budget du bundle au frontend). Si l'entrée `readdir-glob` est retirée : image backend (`prod-deps`, coupes D-30 de `backend/docker/prune-unused-deps.mjs`, un seul `minimatch` dans `/app/node_modules`) et export de sauvegarde par l'API dans le conteneur. Lire les notes de version d'un parent monté.
4. Refaire dans le dépôt ; le lockfile doit être identique à celui de la copie. Une tâche partiellement faite garde son statut `todo`, avec une ligne au Journal qui dit quelles entrées restent.

## Critères d'acceptation

- [ ] `backend/package.json` et `frontend/package.json` n'ont plus de surcharge `minimatch`.
- [ ] `npm ls minimatch` : une seule version 11.x par paquet, aucun `invalid` ; `npm audit` et `npm audit --omit=dev` à 0 dans les deux paquets.
- [ ] `npm ci`, `tsc`, lint, build et `npm test` passent dans les paquets modifiés ; jobs « Docker build (backend) » et Smoke verts.

## Tests à ajouter ou adapter

Aucun si aucune ligne de code ne change :

- `backup.test.ts` passe par `archiver` pour l'export ZIP. La relecture de la PR #164 a montré qu'un `minimatch` sans export `Minimatch` fait échouer ce fichier dès l'import d'`archiver` ; aucun test ne construit de motif, car `backup.ts` appelle `archive.directory()` sans motif.
- Le lint passe par `eslint` et `@eslint/config-array`. Les relectures des PR #170 et #172 ont comparé la liste des fichiers analysés et des sondes (dossiers ignorés, dossier pointé, chemin profond) avec `minimatch` 10.2.6 puis 11.0.8 : refaire cette comparaison si un parent change de version majeure de `minimatch`.

## Points d'attention

- `build.mjs --ready` la donne prête dès que ses dépendances sont faites : les conditions, externes, ne se vérifient qu'à l'étape 1.
- Les entrées se retirent une par une, selon leur parent : le frontend et le backend dev n'attendent pas `archiver`.
- D-21 (réactiver Dependabot npm après la phase B) n'attend pas cette tâche : B-22 peut rester `todo` longtemps, en attente des parents, sans bloquer la fin de la phase B pour D-21 (B-22 n'est pas dans ses `depends_on`). Même situation que B-16 en son temps.
- Une seule tâche à la fois sur chaque `package-lock.json`.
- Ne pas passer sur une pré-version d'un parent pour retirer une surcharge.
- Pas de `npm audit fix --force` (il propose de descendre `archiver` en 7.0.1 au backend, `eslint` en 9.39.5 au frontend) ; ne pas baisser le seuil de l'audit dans `ci.yml`.

## Journal

- 2026-11-12 : tâche créée par la PR docs de suivi du lot D-35/E-18/B-20/C-12 à partir de la relecture de la PR #164 (B-20). Condition de retrait et entrée de lockfile vérifiées sur `develop` (9799168) : surcharge présente, `archiver` 8.0.0 → `readdir-glob ^3.0.0`, `readdir-glob` 3.0.0 → `minimatch ^10.2.2`, entrée imbriquée `minimatch` 11.0.8 ; sur le registre, `archiver` 8.0.0 et `readdir-glob` 4.0.0 sont toujours les dernières versions.
- 2026-11-12 : étendue au backend dev (B-23, PR #172) et au frontend (B-21, PR #170), par la PR docs de suivi du lot C-47/C-48/B-21/C-46, d'après les relectures des PR #170 et #172 (texte proposé par la seconde). L'entrée imbriquée `readdir-glob/node_modules/minimatch` n'existe plus ; retraits prématurés simulés sur des copies : l'avis revient toujours dans `npm audit` (`moderate`, sous le seuil de la CI). Revérifié sur `develop` (923c4ed), Node 24.14.0, npm 11.9.0, copies avec `npm install --package-lock-only` : sans les trois entrées de dev, trois `minimatch` 10.2.6 imbriqués et `npm audit` à 10 `moderate` dans chaque paquet, `--omit=dev` à 0 (6 entrées `oxide-wasm32-wasi` ajoutées au frontend) ; sans l'entrée `readdir-glob`, `node_modules/readdir-glob/node_modules/minimatch` 10.2.6 de production et `--omit=dev` à 3 `moderate` ; dans tous les cas `npm audit --omit=dev --audit-level=high` sort en 0. Les cas « condition remplie » (parents simulés qui déclarent `^11`) n'ont pas été rejoués : ils viennent de la relecture de la PR #172. La procédure par `npm dedupe` notée dans le Journal de B-21 est remplacée : la relecture de la PR #170 a montré qu'un `npm dedupe` nu fait aussi monter des paquets sans rapport. Titre et fichier renommés (`B-22-deps-readdir-glob-override-removal.md` → `B-22-deps-minimatch-overrides-removal.md`) : la branche proposée par `build.mjs` suit le nom du fichier.
