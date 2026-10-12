---
id: C-37
title: "Banc de mise à jour : reconnaître le refus sur une migration en échec"
phase: C
lane: ci
criticite: basse
effort: S
status: done
owner: agent
depends_on: [C-18]
touches: [scripts/upgrade-test/]
sources: []
branch: chore/C-37-bench-failed-migration-refusal
pr: "#131"
---

## Contexte

Trouvé pendant C-18. Depuis C-18, quand `prisma migrate deploy` échoue (`P3018`, puis `P3009` aux démarrages suivants), l'entrypoint refuse de démarrer avec un message qui commence par `ERROR: migration <nom> failed. The backend will not start.`, nomme la copie `pre-migrate-*` faite avant la tentative et ne fait plus de nouvelle copie tant que la migration est marquée en échec.

Le banc `scripts/upgrade-test/` ne connaît qu'un refus propre : celui de la baseline `0_init` (`profile.refusalLog`, une seule chaîne), avec une base inchangée au SHA-256 près.

## Problème constaté

Essai de C-18 sur une copie du jeu d'essai avec une catégorie en double, chemin `1.4.0,local`, layout `friend`, mode naïf, sans le hook temporaire de D-01 :

- `refusal message` : KO, `"does not match migration 0_init" missing`, alors que le log contient le message de C-18 ;
- `database left untouched by the refused start` : KO, `database file changed`. C'est attendu : la baseline marque `0_init` appliquée, et Prisma ajoute une ligne en échec dans `_prisma_migrations` (2 lignes). Les tables de données sont intactes (aucune perte dans le comptage) ;
- `pre-migrate-*.db backup` : OK, 1 copie pour 3 démarrages.
- `backend starts` a affiché une fois `refused: exit code 0, 2 restart(s)` pour ce même refus (code 1 au premier essai) : le code est lu pendant que `restart: unless-stopped` relance le conteneur, et Docker le remet à 0. Lire le code de la dernière sortie (événements `die`, ou `State.Restarting`), pas l'état courant.

Le banc compte donc deux échecs inattendus pour un refus que les notes décrivent comme normal (doublons, voir v1.8.0).

## Ce qu'il faut faire

1. Permettre plusieurs messages de refus par version (`refusalLog` en liste, ou un second champ), et ajouter celui de C-18 au profil de la version qui le livre.
2. Pour un refus sur migration en échec, remplacer le contrôle « base inchangée » (SHA-256) par : aucune perte dans les tables de données, et la dernière copie `pre-migrate-*` identique à la base d'avant le saut.
3. Optionnel : un mode ou une option pour injecter un doublon dans la copie de travail, afin de rejouer ce cas sans préparer un jeu d'essai modifié à la main.

## Critères d'acceptation

- [x] Sur un jeu d'essai avec doublon, le saut vers la version qui livre C-18 est rapporté comme un refus propre (0 échec inattendu) en mode naïf.
- [x] Le refus de la baseline `0_init` reste reconnu comme avant.
- [x] Tests unitaires du banc adaptés (`node --test scripts/upgrade-test/test/*.test.mjs`).

## Tests à ajouter ou adapter

- `checks.test.mjs` (ou un nouveau fichier pour `lib/bench.mjs`) : refus avec chacun des messages, contrôle de la copie `pre-migrate`.

## Points d'attention

- Le jeu d'essai reste hors du dépôt ; le rapport ne contient que des nombres.

## Journal

- 2026-10-12 : tâche créée pendant C-18 (point d'attention « le banc attend un refus propre »).
- 2026-10-12 : fait (PR #131). `profile.refusalLog` devient `profile.refusals` (liste de `{ log, database }`, cumulée d'une version à l'autre par `profileOf`). Les deux refus sont définis dans `lib/checks.mjs` : `BASELINE_REFUSAL` (listé par `hooks/1.6.0.mjs`, base inchangée au SHA-256 près) et `FAILED_MIGRATION_REFUSAL` (`database: 'backupBeforeJump'` : la dernière copie `pre-migrate-*` doit avoir le SHA-256 de la base d'avant le saut ; le comptage des lignes reste contrôlé à chaque démarrage). Code de sortie d'un refus lu dans le dernier événement `die` du conteneur (`State.ExitCode` reste à 0 pendant les relances, vérifié avec un conteneur de test). Point 3 (injection d'un doublon) non fait. Banc : copie temporaire du jeu d'essai avec une catégorie en double, `1.4.0,local`, `friend`, naïf, avec un `hooks/1.12.0.mjs` temporaire non commité (refus de C-18 et actions de D-01) : refus reconnu, 0 échec inattendu, code de sortie 1 et 2 relances, aucune perte, copie `pre-migrate` identique à la base d'avant le saut, 1 copie pour 3 démarrages. Le refus `0_init` est couvert par les tests unitaires ; il n'est pas reproductible sur le banc, car v1.4.0 réaligne le schéma par `db push --accept-data-loss`. Tests du banc : 42 OK.
- 2026-10-12 : Notes de version : aucune action pour les utilisateurs. Hook du banc pour v1.12.0 : ajouter `refusals: [FAILED_MIGRATION_REFUSAL]` (import depuis `../lib/checks.mjs`) au profil, à côté des actions de D-01.
