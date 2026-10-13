---
id: D-30
title: "Image backend : ne garder en production que les dépendances utiles"
phase: D
lane: infra
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [D-01, B-11]
touches: [backend/Dockerfile, backend/package.json, backend/package-lock.json, backend/docker-entrypoint.sh]
sources: []
branch:
pr:
---

## Décisions validées (2026-10-13)

- **Principe** : chaque paquet présent dans l'image de production doit y avoir une raison d'être. On retire ce qui ne sert pas à l'exécution, en particulier les outils (CLI, interfaces, types), même si le gain de taille est faible. Garder une image petite est un objectif, mais pas au détriment de ce qui est nécessaire au fonctionnement (décision de l'humain, relecture de la PR docs #135).

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
2. CLI Prisma : étudier comment l'entrypoint peut appliquer les migrations sans embarquer ce qui ne sert pas à `migrate deploy`, `migrate diff` et `migrate resolve`. Pistes à évaluer : retirer après `npm prune` les paquets que la CLI ne charge pas pour ces commandes (vérifié commande par commande) ; installer la CLI seule dans un dossier à part de l'étage `prod-deps` ; appliquer les migrations sans la CLI. Le comportement de l'entrypoint (copie `pre-migrate`, baseline, refus de C-18) ne doit pas changer.
3. Appliquer ce qui est sûr, sans modifier le comportement de l'application. Noter dans le Journal ce qui reste et pourquoi.
4. Mesurer la taille de l'image avant et après.

## Critères d'acceptation

- [ ] L'inventaire de l'étape 1 est dans la PR (paquets ou groupes, raison, taille).
- [ ] `@prisma/studio-core`, `react`, `react-dom`, `@radix-ui/*` et `@types/node` ne sont plus dans l'image, ou le Journal explique pourquoi l'un d'eux doit rester.
- [ ] Le démarrage sur une copie du jeu d'essai réel (v1.4.0) passe comme avant : sauvegarde, P3005, baseline `0_init`, migrations appliquées, `/api/health` 200. Une installation neuve et un second démarrage passent aussi.
- [ ] Le refus sur migration en échec (C-18) et le refus de la baseline restent identiques (message et code de sortie).
- [ ] Check Smoke vert ; taille de l'image avant/après dans la PR.

## Tests à ajouter ou adapter

- Aucun test unitaire attendu. Vérifications dans l'image décrites dans la PR ; le banc de mise à jour (`scripts/upgrade-test/`) sur `1.4.0,local` si l'entrypoint ou l'étage `prod-deps` change.

## Points d'attention

- D-26 touche aussi `backend/Dockerfile` (retrait de `src/` de l'image) : enchaîner, pas en parallèle.
- Une seule tâche à la fois sur `backend/package-lock.json` (couloir `deps`).
- B-16 retirera les surcharges `deepmerge-ts`/`mysql2` quand Prisma corrigera : vérifier que la solution retenue ne dépend pas de ces surcharges.
- Ne pas casser les commandes `--entrypoint` données dans le README (vérification d'intégrité, `migrate resolve`).

## Journal

- 2026-10-13 : tâche créée par la PR docs #135 (suites du lot C-35/E-10/B-11/C-37/E-30), sur décision de l'humain, à partir de la relecture de B-11 (PR #130).
