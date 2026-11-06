---
id: D-30
title: "Image backend : ne garder en production que les dépendances utiles"
phase: D
lane: infra
criticite: basse
effort: S
status: done
owner: agent
depends_on: [D-01, B-11]
touches: [backend/Dockerfile, backend/docker/prune-unused-deps.mjs, backend/package.json, backend/package-lock.json, backend/docker-entrypoint.sh]
sources: []
branch: chore/D-30-backend-image-runtime-deps
pr: 138
---

## Décisions validées (2026-10-13)

- **Principe** (décision de l'humain, relecture de la PR docs #135) : avant la taille, ce qui compte est que chaque dépendance de l'image de production y ait un vrai intérêt. Un outil comme une CLI n'a pas sa place par défaut dans une image de prod : vérifier s'il est vraiment utile et si l'on peut s'en passer. Ne rien retirer au détriment de ce qui est important : le démarrage (migrations de l'entrypoint) et les procédures documentées lancées dans l'image (README, UPGRADING) doivent continuer à marcher, ou recevoir un remplacement documenté. Garder une image petite reste un objectif.

## Contexte

Depuis D-01 (PR #108), `prisma` est en `dependencies` : l'entrypoint (`backend/docker-entrypoint.sh`) applique les migrations au démarrage avec la CLI (`migrate deploy`, baseline `0_init` par `migrate diff` puis `migrate resolve`, refus propre d'une migration en échec depuis C-18). L'étage `prod-deps` du `Dockerfile` garde ensuite toutes les dépendances de production (`npm prune --omit=dev --omit=optional`).

## Problème constaté

Relevé par la relecture de B-11 (PR #130) :

- La CLI `prisma` amène `@prisma/studio-core`, et avec lui `react`, `react-dom`, `scheduler` et `@radix-ui/*` : une interface web (Prisma Studio) que l'image n'utilise jamais.
- Depuis B-11, `mysql2` ≥ 3.17.5 (base MySQL, jamais utilisée avec SQLite, amené par la CLI) déclare `@types/node` en pair obligatoire : `@types/node` et `undici-types` (environ 3 Mo de fichiers `.d.ts`) passent dans l'image.
- `npm prune --omit=peer` n'est pas une solution : il retire `react` mais garde `@types/node`.
- Aucun inventaire ne dit aujourd'hui pourquoi chaque paquet de `node_modules` est dans l'image.

## Ce qu'il faut faire

1. Inventaire : lister les paquets de `node_modules` de l'image (`npm ls --omit=dev --all` ou `docker run --rm --entrypoint ls`), groupés par dépendance directe, avec la taille. Classer chaque groupe : utilisé à l'exécution par l'API, utilisé par l'entrypoint (CLI Prisma), ou inutile.
2. CLI Prisma : étudier comment l'entrypoint peut appliquer les migrations sans embarquer ce qui ne sert pas à `migrate deploy`, `migrate diff` et `migrate resolve`. Pistes à évaluer : retirer après `npm prune` les paquets que la CLI ne charge pas pour ces commandes (vérifié commande par commande) ; installer la CLI seule dans un dossier à part de l'étage `prod-deps` ; appliquer les migrations sans la CLI. Le comportement de l'entrypoint (copie `pre-migrate`, baseline, refus de C-18) ne doit pas changer. Commandes à garder (ou à remplacer avec la documentation) : celles de l'entrypoint (`migrate deploy`, `migrate diff`, `migrate resolve --applied`) et celles que README et UPGRADING font lancer dans l'image (`migrate status`, `migrate resolve --rolled-back`, `dist/scripts/check-integrity.js`).
3. Appliquer ce qui est sûr, sans modifier le comportement de l'application. Noter dans le Journal ce qui reste et pourquoi.
4. Mesurer la taille de l'image avant et après.

## Critères d'acceptation

- [x] L'inventaire de l'étape 1 est dans la PR (paquets ou groupes, raison, taille).
- [x] `@prisma/studio-core`, `react`, `react-dom`, `@radix-ui/*` et `@types/node` ne sont plus dans l'image, ou le Journal explique pourquoi l'un d'eux doit rester.
- [x] Le démarrage sur une copie du jeu d'essai réel (v1.4.0) passe comme avant : sauvegarde, P3005, baseline `0_init`, migrations appliquées, `/api/health` 200. Une installation neuve et un second démarrage passent aussi.
- [x] Le refus sur migration en échec (C-18) et le refus de la baseline restent identiques (message et code de sortie).
- [x] Les commandes Prisma et la vérification d'intégrité que README et UPGRADING font lancer dans l'image marchent toujours (`migrate status`, `migrate resolve --applied`/`--rolled-back`, `check-integrity.js`), ou la documentation donne leur remplacement.
- [x] Check Smoke vert ; taille de l'image avant/après dans la PR.

## Tests à ajouter ou adapter

- Aucun test unitaire attendu. Vérifications dans l'image décrites dans la PR ; le banc de mise à jour (`scripts/upgrade-test/`) sur `1.4.0,local` si l'entrypoint ou l'étage `prod-deps` change.

## Points d'attention

- D-26 touche aussi `backend/Dockerfile` (retrait de `src/` de l'image) : enchaîner, pas en parallèle.
- Une seule tâche à la fois sur `backend/package-lock.json` (couloir `deps`).
- B-16 retirera les surcharges `deepmerge-ts`/`mysql2` quand Prisma corrigera : vérifier que la solution retenue ne dépend pas de ces surcharges.
- Les procédures documentées lancent la CLI de trois façons : `--entrypoint` (README:269), `docker compose exec`/`docker exec` dans le conteneur qui tourne (README:209, UPGRADING:236, :278), et `docker compose run`, qui passe par l'entrypoint (`exec "$@"` dans `docker-entrypoint.sh`, README:282). Vérifier les trois.
- Piste « CLI dans un dossier à part » : l'entrypoint et la documentation appellent `npx prisma` depuis `/app`. Si `node_modules/.bin/prisma` n'y est plus, `npx` irait chercher `prisma` sur le registre (réseau, version non épinglée) au lieu d'échouer. `prisma.config.ts` importe `prisma/config` et `dotenv` depuis `/app` : la résolution doit continuer à marcher. Si la documentation change, `README.md` s'ajoute aux `touches` (UPGRADING passe par les notes de version).

## Journal

- 2026-10-13 : tâche créée par la PR docs #135 (suites du lot C-35/E-10/B-11/C-37/E-30), sur décision de l'humain, à partir de la relecture de B-11 (PR #130).
- 2026-10-13 : fait (PR #138). La CLI Prisma reste dans l'image : l'entrypoint (`migrate deploy`, baseline par `migrate diff` et `migrate resolve`) et les procédures de README et UPGRADING (`npx prisma migrate status`, `resolve --rolled-back`) en ont besoin ; s'en passer demanderait une image de migration à part ou un exécuteur de migrations maison (la comparaison de la baseline exige le moteur de schéma), avec de nouvelles procédures : décision de conception pour l'humain, hors de cette tâche. Après `npm prune`, l'étage `prod-deps` lance `backend/docker/prune-unused-deps.mjs` (ajouté à `touches`), qui coupe des arêtes du graphe de dépendances et supprime ce qui n'est plus atteignable depuis `package.json` ; une arête absente arrête le build. Retirés : les dépendances de `@prisma/studio-core` (React, React DOM, Radix, visx, d3, `@types/react`…), le serveur Postgres local de `@prisma/dev` (PGlite…), `mysql2` (avec `@types/node` et `undici-types`), `postgres` et `prebuild-install` : 118 paquets, 77 Mio. `node_modules` passe de 362 à 285 Mio, l'image de 165 à 148 Mo compressée (723 à 625 Mo sur disque). `@prisma/studio-core` et `@prisma/dev` restent : `prisma/build/cli.js` charge au démarrage, quelle que soit la commande, les modules `dist/data/` du premier et `dist/state.cjs` du second (sans eux, `prisma --version` échoue). Indépendant des surcharges de B-16 : même résultat avec un lockfile régénéré sans elles. Aucune procédure ne change ; `prisma studio` et `prisma dev`, non documentés, ne marchent plus dans l'image. Les fichiers jamais chargés à l'intérieur des paquets gardés (interface de Studio, compilateurs de requêtes des autres bases, sources de SQLite, `.map`, `.d.ts`) sont suivis par la nouvelle tâche D-31.
- 2026-10-13 : vérifications (PR #138, nombres seulement). Sur des copies du jeu d'essai, image avant et après : installation neuve et second démarrage, démarrage v1.4.0 (sauvegarde, P3005, baseline `0_init`, 3 migrations, `/api/health` 200), refus C-18 (P3018 puis P3009) et refus de la baseline avec les mêmes messages et le code 1, commandes de README et UPGRADING sous les trois formes (`--entrypoint`, `exec`, `run` par l'entrypoint, aussi par `docker compose`) avec les mêmes codes de sortie, `--network none` pour les commandes ponctuelles. Banc `1.4.0,local` vert en `friend` et `official` (naïf et conforme, 42/42 photos, 762 lignes sans perte), avec un hook `1.12.0.mjs` temporaire non commité ; Smoke local et check Smoke verts.
- 2026-10-13 : piste « CLI dans un dossier à part » (étape 2) écartée : elle garde les mêmes paquets, donc ne réduit pas la taille, et ajoute le risque `npx` des Points d'attention (`npx prisma` depuis `/app` irait chercher la CLI sur le registre).
- 2026-10-13 : relecture de la PR #138 approuvée. Ajustements : l'étage `prod-deps` se termine par `RUN --network=none CHECKPOINT_DISABLE=1 node_modules/.bin/prisma --version`, qui fait échouer le build en amd64 comme en arm64 si une mise à jour de Prisma fait charger à la CLI un paquet coupé (vérifié : une coupe de `@prisma/studio-core` arrête le build sur `Cannot find module`) ; une montée de version de Prisma (couloir `deps`) peut donc demander de toucher aussi `backend/Dockerfile`. Le script supprime les dossiers de scope qu'il a vidés (`@radix-ui`, `@electric-sql`, `@visx`…), pas ceux que `npm prune` laisse vides.
- 2026-10-13 : décision de l'humain : « Garder la CLI ». Mesure du relecteur : sans la CLI, l'image ferait 98 Mo compressés (392 Mo sur disque, `node_modules` 110 Mio) contre 148 Mo avec, soit environ 50 Mo compressés pour la CLI. Aucun changement pour l'utilisateur, migrations par l'outil officiel (P3005, P3009, baseline). Pas de tâche de réévaluation.
