---
id: B-23
title: "Avis minimatch des dépendances de dev du backend : surcharge ciblée comme au frontend"
phase: B
lane: deps
criticite: basse
effort: S
status: done
owner: agent
depends_on: [B-20, B-21]
touches: [backend/package.json, backend/package-lock.json]
sources: []
branch: chore/B-23-deps-backend-dev-minimatch
pr: "#172"
---

## Décisions validées

- 2026-11-12 : à la question de la relecture de la PR #170 (B-21) sur le `minimatch` de dev du backend (point non bloquant 4 : (a) nouvelle tâche B qui applique au backend la surcharge ciblée des trois parents, ou (b) garder l'avis de dev et le noter dans B-20/B-22), l'humain répond : « Task run in this batch ». Option (a), traitée dans le lot en cours.

## Contexte

B-20 (PR #164) a surchargé `minimatch` sous le seul paquet de production qui l'utilise : `"readdir-glob": { "minimatch": "^11.0.1" }`. L'outillage de dev du backend était resté sans surcharge, hors du seuil de la CI. B-21 (PR #170) a ensuite posé une surcharge ciblée sur l'outillage de dev du frontend : `"eslint"`, `"@eslint/config-array"`, `"@typescript-eslint/typescript-estree"` → `{ "minimatch": "^11.0.1" }`. Les deux paquets suivaient alors des règles différentes.

## Problème constaté

Sur `develop` (bf140a8), `backend/package-lock.json` garde `minimatch` 10.2.6 (dev) à la racine, à côté de l'entrée imbriquée `node_modules/readdir-glob/node_modules/minimatch` 11.0.8 posée par B-20 :

- `npm audit` backend : 10 `moderate` (GHSA-g3hv-75wg-m249, plage vulnérable 7.0.0 à 11.0.0, comptée avec ses dépendants `eslint`, `@eslint/js`, `@eslint/config-array`, `typescript-eslint` et les cinq `@typescript-eslint/*`) ; `npm audit --omit=dev` : 0.
- Les seuls paquets du lockfile qui déclarent `minimatch` en dev sont `eslint` 10.12.0 (`^10.2.5`), `@eslint/config-array` 0.23.5 (`^10.2.4`) et `@typescript-eslint/typescript-estree` 8.71.1 (`^10.2.2`). Leurs dernières versions (10.14.0, 0.23.5, 8.72.2) demandent toujours `^10`.
- L'alerte Dependabot #18 (`minimatch`, `backend/package-lock.json`, ouverte sur `main` le 2026-11-06) resterait ouverte après la release suivante à cause de cette entrée 10.2.6.

## Ce qu'il faut faire

1. Vérifier dans le lockfile quels paquets déclarent `minimatch`, et l'API de `minimatch` 11 qu'ils utilisent.
2. Ajouter à `backend/package.json`, à côté de la surcharge `readdir-glob` (inchangée), la même surcharge ciblée que le frontend pour ces parents, puis `npm install`. Pas de `npm audit fix --force`, pas de `npm dedupe` nu.
3. Garder la surcharge seulement si `npm ci`, `npm run lint` (même liste de fichiers, ignores respectés), `npx tsc --noEmit`, `npm test`, `npm run build` passent et que l'image du backend n'embarque pas de nouveau `minimatch`. Sinon la retirer et noter la raison au Journal.
4. `npm audit` complet et `--omit=dev`, `npm ls minimatch` avant et après (aucun `invalid`).

## Critères d'acceptation

- [x] `npm audit` backend ne signale plus `minimatch` (0 avis, dev compris) ; `npm audit --omit=dev` reste à 0.
- [x] `npm ls minimatch` : une seule version 11.x, sans `invalid` ; la surcharge `readdir-glob` n'est pas modifiée.
- [x] Le lockfile ne change que les entrées `minimatch` ; aucun paquet sans rapport ne bouge.
- [x] `npm ci`, lint (mêmes fichiers analysés), `npx tsc --noEmit`, `npm test` et `npm run build` passent ; l'image du backend contient un seul `minimatch`, 11.0.8, et l'export de sauvegarde fonctionne.
- [ ] Après le merge sur `main` à la release suivante, l'alerte Dependabot #18 est fermée.

## Tests à ajouter ou adapter

Aucun : aucune ligne de code ne change. La suite existante sert de test (`backup.test.ts` charge `archiver` → `readdir-glob` → `minimatch`, le lint passe par `eslint` et `@eslint/config-array`).

## Points d'attention

- Dépendances de dev seulement : pas de ligne dans les notes de version.
- Une seule tâche à la fois sur `backend/package-lock.json`.
- La surcharge déplace l'entrée de production : `minimatch` 11.0.8 passe de `node_modules/readdir-glob/node_modules/minimatch` à `node_modules/minimatch` (même version, même `integrity`), partagée par `readdir-glob` et l'outillage de dev. B-22 doit en tenir compte : l'entrée imbriquée qu'elle demande de supprimer n'existe plus.

## Journal

- 2026-11-12 : tâche créée sur décision humaine (voir « Décisions validées »), après la relecture de la PR #170.
- 2026-11-12 : PR #172. Audit refait sur `develop` (bf140a8) : `npm audit` 10 `moderate` (`minimatch` 10.2.6 et ses dépendants), `--omit=dev` 0. Les trois seuls parents de dev de `minimatch` dans le lockfile sont ceux du frontend : `eslint`, `@eslint/config-array`, `@typescript-eslint/typescript-estree`. API utilisée : classe `Minimatch` (options `dot`, `flipNegate`) et `match(path, partial)` pour les deux premiers, fonction `minimatch()` avec `dot` pour le troisième (seulement avec `allowDefaultProject`, que `eslint.config.js` ne définit pas) ; inchangées en 11. Surcharge ajoutée sous les trois parents, la surcharge `readdir-glob` n'est pas touchée. Lockfile : `node_modules/minimatch` passe de 10.2.6 (dev) à 11.0.8, l'entrée imbriquée `node_modules/readdir-glob/node_modules/minimatch` 11.0.8 disparaît ; rien d'autre ne bouge (326 entrées de production avant et après, seul le chemin de `minimatch` change ; `@isaacs/nonrecursive-glob-match` et `brace-expansion` étaient déjà de production). `npm ls minimatch` : un seul 11.0.8, dédupliqué pour les quatre parents, aucun `invalid`. `npm audit` : 0, `--omit=dev` : 0. Avec 10.2.6 puis 11.0.8, `eslint .` analyse les mêmes 134 fichiers ; une sonde (fichiers dans `dist/`, `coverage/`, `src/generated/`, `src/.hidden/`, `src/deep/a/b/`, un `.js`) donne le même résultat : les trois dossiers ignorés le restent, le dossier pointé et le chemin profond sont analysés (`dot: true`, `**`). `npm ci`, `npx tsc --noEmit`, `npm run build` et `npm test` (56 fichiers, 1272 tests, comme sur `develop`) passent. Image `carta-b-23-backend` : un seul `minimatch`, 11.0.8 à `node_modules/minimatch`, pas d'`eslint` ; `prisma --version` sans réseau passe ; export `GET /api/backup/export` en 200 avec un fichier dans `uploads/` (ZIP de 4 entrées). Surcharge gardée. Retrait simulé sur des copies du lockfile : retirer trop tôt les trois entrées de dev crée trois `minimatch` 10.2.6 imbriqués (`npm audit` 10 `moderate`) ; retirer trop tôt `readdir-glob` crée `node_modules/readdir-glob/node_modules/minimatch` 10.2.6 (`--omit=dev` 3 `moderate`). Dans les deux cas l'audit signale à nouveau l'avis, contrairement au cas décrit dans B-22. Procédure de retrait à reporter dans B-22 par la PR docs de fin de lot.
- 2026-11-12 : PR docs de suivi du lot C-47/C-48/B-21/C-46. B-22 tient compte du déplacement de l'entrée de production (point d'attention ci-dessus) : étendue au backend dev et au frontend, sans étape de suppression d'entrée du lockfile, d'après la relecture de la PR #172.
