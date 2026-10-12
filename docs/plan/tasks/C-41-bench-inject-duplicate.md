---
id: C-41
title: "Banc de mise à jour : option pour injecter une catégorie en double"
phase: C
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-37]
touches: [scripts/upgrade-test/]
sources: []
branch:
pr:
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

- [ ] `--path 1.4.0,local --layout friend --inject-duplicate`, naïf et conforme : refus reconnu (`refusal message` OK, `backupBeforeJump` OK), 0 échec inattendu, et la raison de `backend starts` est celle du doublon injecté.
- [ ] Sans l'option, les rapports sont inchangés.
- [ ] `--inject-duplicate` avec un chemin qui commence à v1.8.0 ou après, ou sur une base qui a déjà `Category_name_key` : refusé avec un message clair.
- [ ] Tests unitaires du banc (`node --test scripts/upgrade-test/test/*.test.mjs`) : raisons autorisées avec l'option, refus de l'option selon le chemin.

## Tests à ajouter ou adapter

- `checks.test.mjs` : `allowedFailures` avec l'option (naïf et conforme), validation du chemin.

## Points d'attention

- Seul le message de C-18 est reconnu. Un saut vers v1.8.0 à v1.11.0 avec le doublon s'arrête sur l'erreur Prisma `P3018`, sans ce message : ce refus n'est pas reconnu, et le contrôle de la base reste le contrôle strict (SHA-256 inchangé), qui échoue. Le chemin à documenter est donc un saut direct d'une version antérieure à v1.8.0 vers une version qui livre C-18 (v1.12.0 et après, ou `local`).
- Le jeu d'essai reste hors du dépôt, et le rapport ne contient que des nombres.

## Journal

- 2026-10-13 : tâche créée par la relecture de la PR #131 (C-37, étape 3 optionnelle).
