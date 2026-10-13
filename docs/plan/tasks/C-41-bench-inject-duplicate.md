---
id: C-41
title: "Banc de mise à jour : option pour injecter une catégorie en double"
phase: C
lane: ci
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-37]
touches: [scripts/upgrade-test/]
sources: []
branch: chore/C-41-bench-inject-duplicate
pr: "#137"
---

## Contexte

Étape 3 optionnelle de C-37, reprise par la relecture de la PR #131. Depuis C-37, le banc `scripts/upgrade-test/` reconnaît le refus sur une migration en échec (`FAILED_MIGRATION_REFUSAL` dans `lib/checks.mjs`, contrôle `backupBeforeJump`). Pour le rejouer, il faut un jeu d'essai avec un doublon, préparé à la main : une copie du jeu d'essai, puis un `INSERT` dans `Category` qui reprend le `name` d'une catégorie existante. La migration `20261010173910_schema_integrity` (livrée en v1.8.0) crée alors l'index unique `Category_name_key` et échoue.

## Problème constaté

- Chaque essai et chaque relecture refait cette préparation à la main (C-18, C-37, relecture de la PR #131).
- En naïf, le « 0 échec inattendu » sur ce cas ne vient pas de la reconnaissance du refus : `backend starts` est autorisé par un `naiveMayFail.startup` d'une autre cause (v1.5.0 `JWT_SECRET`, ou D-01 droits uid 1000 dans le hook 1.12.0). Le rapport donne donc une raison fausse. En conforme, le même cas compte 2 échecs inattendus (`v1.6.0 Before 4`, la copie refusée, et `backend starts`), alors que le doublon est voulu.

## Ce qu'il faut faire

1. Ajouter une option `--inject-duplicate` à `run.mjs` (usage, `parseCli`, tableau des options du README).
2. Dans `BenchRun.prepare()` (`lib/bench.mjs`), après `createAnonymizedCopy` et avant `takeSnapshot` (la référence des comptages inclut donc le doublon) : ajouter dans la copie de travail une catégorie qui reprend le `name` d'une catégorie existante, par le conteneur helper (`runHelper`, comme `lib/database.mjs`). Aucune donnée lue ne sort du helper : le rapport ne donne que le nombre de lignes ajoutées.
3. Avec l'option, attendre le refus `FAILED_MIGRATION_REFUSAL` dans les deux modes : autoriser `startup` avec sa propre raison (« doublon injecté par `--inject-duplicate` : la migration `schema_integrity` refuse les doublons »), à la place de celle de `naiveMayFail`. En conforme, autoriser aussi l'échec de `checkDatabaseCopy` (`v1.6.0 Before 4`) pour la même raison.
4. Refuser l'option (code de sortie 2) dans deux cas. Si le chemin commence à v1.8.0 ou après, le premier démarrage refuse déjà, sans version de départ qui tourne. Si la copie a déjà l'index unique `Category_name_key` (jeu d'essai pris sur une instance v1.8.0 ou plus récente), l'insertion échoue.

## Critères d'acceptation

- [x] `--path 1.4.0,local --layout friend --inject-duplicate`, naïf et conforme : refus reconnu (`refusal message` OK, `backupBeforeJump` OK), 0 échec inattendu, et la raison de `backend starts` est celle du doublon injecté.
- [x] Sans l'option, les rapports sont inchangés.
- [x] `--inject-duplicate` avec un chemin qui commence à v1.8.0 ou après, ou sur une base qui a déjà `Category_name_key` : refusé avec un message clair.
- [x] Tests unitaires du banc (`node --test scripts/upgrade-test/test/*.test.mjs`) : raisons autorisées avec l'option, refus de l'option selon le chemin.

## Tests à ajouter ou adapter

- `checks.test.mjs` : `allowedFailures` avec l'option (naïf et conforme), validation du chemin.

## Points d'attention

- Seul le message de C-18 est reconnu. Un saut vers v1.8.0 à v1.11.0 avec le doublon s'arrête sur l'erreur Prisma `P3018`, sans ce message : ce refus n'est pas reconnu, et le contrôle de la base reste le contrôle strict (SHA-256 inchangé), qui échoue. Le chemin à documenter est donc un saut direct d'une version antérieure à v1.8.0 vers une version qui livre C-18 (v1.12.0 et après, ou `local`).
- Aujourd'hui, `allowedFailures` et `markExpected` (`lib/expectations.mjs`) ne s'appliquent qu'à `step.checks` (`runStep` dans `lib/bench.mjs`). `unexpectedFailures([...step.actions, ...step.checks])` compte toujours une action en statut `failed`, par exemple `checkDatabaseCopy` (`v1.6.0 Before 4`). Pour autoriser cet échec en conforme (point 3), il faut étendre ce mécanisme aux actions, avec la raison du doublon injecté.
- Le jeu d'essai reste hors du dépôt, et le rapport ne contient que des nombres.

## Journal

- 2026-10-13 : tâche créée par la relecture de la PR #131 (C-37, étape 3 optionnelle).
- 2026-10-13 : fait (PR #137). Option `--inject-duplicate` de `run.mjs`. Le profil de `hooks/1.8.0.mjs` porte `uniqueCategoryNames: true` (hérité par les versions suivantes) : le chemin est refusé (code 2) s'il commence sur une version qui l'a, et la base est refusée si elle a déjà `Category_name_key` (lue en `immutable=1` sur un montage en lecture seule, avant tout pull). `BenchRun.prepare()` copie la catégorie de plus petit id sous un nouvel id (toutes les colonnes sauf la clé, donc indépendant de la version du schéma) avant `takeSnapshot` ; seul le nombre de lignes ajoutées sort du helper et va dans le rapport. Sur chaque étape dont la version refuse les doublons, `startup` est autorisé avec la raison du doublon injecté (à la place de celle de `naiveMayFail` ou d'un `requireStarted` manquant), et en conforme l'échec de `checkDatabaseCopy` : les résultats d'action portent désormais le nom de l'action (`action`), `allowedActionFailures` et `markExpectedActions` (`lib/expectations.mjs`) les marquent, et le tableau des actions du rapport affiche la raison. Banc sur une copie du jeu d'essai, `--path 1.4.0,local --layout friend`, avec un `hooks/1.12.0.mjs` temporaire non commité : avec l'option, naïf et conforme OK, 0 échec inattendu, 2 échecs attendus par mode (`backend starts` avec la raison du doublon ; naïf : dossier de photos du layout ; conforme : `v1.6.0 Before 4`), `refusal message` OK, copie `pre-migrate` identique à la base d'avant le saut, 759 lignes de référence (758 + 1), aucune perte. Sans l'option, rapport identique à celui de `develop` (hors horodatage et durée d'arrêt). Option refusée (code 2) pour `1.8.0,local`, `1.11.0,local` et une copie qui a `Category_name_key`. Tests du banc : 49 OK (tests du chemin dans `versions.test.mjs`, à côté de la fonction).
