---
id: B-24
title: "Avis high effect sous la CLI Prisma : surcharge ciblée en attendant une version de Prisma corrigée"
phase: B
lane: deps
criticite: haute
effort: S
status: done
owner: agent
depends_on: []
touches: [backend/package.json, backend/package-lock.json, docs/plan/tasks/B-22-deps-minimatch-overrides-removal.md]
sources: []
branch: chore/B-24-deps-effect-override
pr: "#192"
---

## Décisions validées

- 2026-11-24, humain : « Override task first (B-24) » — « A task run first in the batch, merged before the others (like B-19): an npm override `effect` ^3.22.1 under @prisma/config, with a check that the Prisma CLI and migrations still work in the image; removed once Prisma ships the fix (noted in B-22's spirit). »

## Contexte

Depuis B-11, l'étape « Audit production dependencies » du job Backend de `.github/workflows/ci.yml` lance `npm audit --omit=dev --audit-level=high` dans `backend/`. Le job Backend est un check requis : quand il échoue, aucune PR ne peut fusionner. B-19 a déjà débloqué cette étape une fois, en passant en premier dans son lot.

## Problème constaté

Constat du coordinateur (2026-11-24), vérifié sur `develop` (9bc7f3d) : l'audit sort en erreur avec 3 avis `high`, tous dus à `effect` 3.20.0 (GHSA-7589-6fvf-x4pw, ReDoS dans `Schema.TemplateLiteral`, plage vulnérable ≤ 3.22.0, corrigé en 3.22.1). Chemin : `prisma` 7.10.1 → `@prisma/config` 7.10.1 → `effect` 3.20.0, en version exacte. Dependabot : alerte #21 (`effect`, dépendance de production).

- Aucune version stable de Prisma ne corrige : la dernière stable est 7.10.1 (dist-tag `prev`) ; `latest` pointe sur une pré-version (`8.0.0-rc.35`) et `@prisma/config` n'a pas de 8.x publiée. `npm audit fix --force` propose de descendre `prisma` en 6.12.0 : à refuser.
- `effect` 3.22.5 est la dernière 3.x (dist-tag `prev`), avec les mêmes dépendances que 3.20.0 (`fast-check ^3.23.1`, `@standard-schema/spec ^1.0.0`).
- Reste une faille `moderate` `i18next` < 26.3.4, sous le seuil de la CI : hors périmètre (B-09 monte i18next).

## Ce qu'il faut faire

1. Ajouter à `backend/package.json`, sur le modèle des surcharges `minimatch` (B-20, B-23), `"@prisma/config": { "effect": "^3.22.1" }`, puis `npm install`. Le lockfile ne doit changer que l'entrée `effect`.
2. `npm audit --omit=dev --audit-level=high` à 0, `npm ls effect` sans `invalid`.
3. CLI Prisma avec cette version : `prisma validate`, `prisma generate`, `prisma migrate deploy` et `migrate status` sur une base temporaire, `npm run db:check`, erreurs de validation de la configuration (`@prisma/config` les décode avec `effect/Schema`).
4. Image backend (`carta-b-24-backend`) : `effect` 3.22.5 présent, contrôle `prisma --version` sans réseau du `Dockerfile`, démarrage sur une base vide, puis sur une base d'une version ancienne (banc `scripts/upgrade-test/`), migrations appliquées au démarrage.
5. Tests, lint, `tsc`, build du backend.

## Critères d'acceptation

- [x] `npm audit --omit=dev --audit-level=high` backend sort en 0, seuil de `ci.yml` inchangé.
- [x] Le lockfile ne change que l'entrée `node_modules/effect` (3.20.0 → 3.22.x) ; `npm ls effect` sans `invalid`.
- [x] CLI Prisma : `validate`, `generate`, `migrate deploy`, `migrate status` et `db:check` passent ; les erreurs de configuration restent lisibles.
- [x] Image backend : `effect` 3.22.x, démarrage et migrations sur une base vide et sur une base ancienne.
- [x] `npm ci`, lint, `npx tsc --noEmit`, `npm run build` et `npm test` passent.
- [x] Condition et commande de retrait de la surcharge notées ici et dans B-22.
- [ ] Après le merge sur `main` à la release suivante, l'alerte Dependabot #21 est fermée.

## Tests à ajouter ou adapter

Aucun : aucune ligne de code ne change. La CLI Prisma n'est pas appelée par la suite Vitest ; elle se vérifie à la main (étapes 3 et 4) et par le job « Docker build (backend) » (`prisma --version` sans réseau) et le Smoke (migrations au démarrage du conteneur).

## Points d'attention

- **Retrait de la surcharge.** Dès qu'une version **stable** de Prisma embarque `effect` ≥ 3.22.1 : `npm view @prisma/config@<version stable> dependencies.effect` (et `npm view prisma dist-tags` pour connaître la stable : au 2026-11-24, `latest` pointe sur une pré-version, la stable est sous `prev`). Lors de la montée de Prisma, retirer l'entrée `"@prisma/config"` de `overrides`, `npm install`, puis `npm ls effect` (une seule version ≥ 3.22.1, aucun `invalid`) et `npm audit --omit=dev --audit-level=high` à 0. Suivi dans B-22 (Journal). Ne pas passer sur une pré-version de Prisma pour retirer la surcharge.
- **Copie embarquée dans la CLI.** `node_modules/prisma/build/cli.js` contient sa propre copie d'`effect` 3.20.0, regroupée au build de Prisma (`moduleVersion` « 3.20.0 » dans le fichier). La surcharge ne la change pas, et `npm audit` ne la voit pas. Elle ne disparaîtra qu'avec une version de Prisma corrigée. Exposition : la CLI ne décode que la configuration locale (`prisma.config.ts`) et ses propres options, jamais une entrée venue du réseau ; `@prisma/config` n'utilise pas `Schema.TemplateLiteral`.
- **Montée de Prisma sans retrait de l'entrée.** Une montée de Prisma (à la main, ou par Dependabot) qui garderait l'entrée `"@prisma/config"` forcerait `effect` 3.x sur le nouveau `@prisma/config`, même s'il demande `effect` 4.x : retirer l'entrée dans la même PR (relecture de la PR #192).
- Une seule tâche à la fois sur `backend/package-lock.json`.
- Pas de `npm audit fix --force` ; ne pas baisser le seuil de l'audit dans `ci.yml`.

## Journal

- 2026-11-24 : tâche créée sur décision humaine (voir « Décisions validées »), à passer en premier dans le lot B-24 / D-40 / E-23 / C-14 / D-36 : les autres PR attendent qu'elle débloque l'audit.
- 2026-11-24 : PR #192. Constat refait sur `develop` (9bc7f3d), Node 24.14.0, npm 11.9.0 : 3 `high` (`effect`, `@prisma/config`, `prisma`) et 1 `moderate` (`i18next`). Surcharge `"@prisma/config": { "effect": "^3.22.1" }` ajoutée après les entrées `minimatch` ; `npm install` installe 3.22.5, seule l'entrée `node_modules/effect` change dans le lockfile. `npm audit --omit=dev --audit-level=high` : 0 ; reste `i18next` (`moderate`, B-09). `npm ls effect` : un seul `effect@3.22.5`, sous `@prisma/config`, aucun `invalid`. `effect` n'est chargé que par `@prisma/config` (`Schema.Struct`, `String`, `optional`, `decodeUnknownEither`, `Either`), pas par l'application. CLI en local : `prisma --version`, `validate`, `generate`, `migrate deploy` puis `migrate status` sur une base temporaire (4 migrations), `db:check` sans différence ; un fichier de configuration avec un mauvais type ou une clé inconnue donne toujours une erreur lisible. `npm ci`, lint, `npx tsc --noEmit`, build et `npm test -- --coverage` passent (58 fichiers, 1319 tests ; 99,27 % des instructions, 95,26 % des branches). Image `carta-b-24-backend` : `/app/node_modules/effect` en 3.22.5, contrôle `prisma --version` sans réseau du `Dockerfile` passé ; sur une base vide, 4 migrations appliquées au démarrage, seed, API démarrée, `migrate status` à jour dans le conteneur, login 200. Banc `--layout friend --path 1.4.0,local --mode conformant` sur le jeu d'essai : OK (base `db push` v1.4.0 sauvegardée, baseline `0_init`, migrations appliquées, `migrate status` à jour, aucune ligne perdue, photos et API publique servies). Trouvé en vérifiant : la CLI embarque sa propre copie d'`effect` 3.20.0 dans `build/cli.js`, hors de portée de la surcharge (voir « Points d'attention »).
- 2026-11-24 : Notes de version (Security, comme B-20 dans v1.13.0) : la CLI Prisma de l'image backend, qui applique les migrations au démarrage, charge `effect` 3.22.5 au lieu de 3.20.0 (GHSA-7589-6fvf-x4pw) ; aucune entrée non fiable n'atteignait le code concerné. Aucune action demandée.
