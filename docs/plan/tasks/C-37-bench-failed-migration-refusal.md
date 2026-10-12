---
id: C-37
title: "Banc de mise à jour : reconnaître le refus sur une migration en échec"
phase: C
lane: ci
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [C-18]
touches: [scripts/upgrade-test/]
sources: []
branch:
pr:
---

## Contexte

Trouvé pendant C-18. Depuis C-18, quand `prisma migrate deploy` échoue (`P3018`, puis `P3009` aux démarrages suivants), l'entrypoint refuse de démarrer avec un message qui commence par `ERROR: migration <nom> failed. The backend will not start.`, nomme la copie `pre-migrate-*` faite avant la tentative et ne fait plus de nouvelle copie tant que la migration est marquée en échec.

Le banc `scripts/upgrade-test/` ne connaît qu'un refus propre : celui de la baseline `0_init` (`profile.refusalLog`, une seule chaîne), avec une base inchangée au SHA-256 près.

## Problème constaté

Essai de C-18 sur une copie du jeu d'essai avec une catégorie en double, chemin `1.4.0,local`, layout `friend`, mode naïf, sans le hook temporaire de D-01 :

- `refusal message` : KO, `"does not match migration 0_init" missing`, alors que le log contient le message de C-18 ;
- `database left untouched by the refused start` : KO, `database file changed`. C'est attendu : la baseline marque `0_init` appliquée, et Prisma ajoute une ligne en échec dans `_prisma_migrations` (2 lignes). Les tables de données sont intactes (aucune perte dans le comptage) ;
- `pre-migrate-*.db backup` : OK, 1 copie pour 3 démarrages.

Le banc compte donc deux échecs inattendus pour un refus que les notes décrivent comme normal (doublons, voir v1.8.0).

## Ce qu'il faut faire

1. Permettre plusieurs messages de refus par version (`refusalLog` en liste, ou un second champ), et ajouter celui de C-18 au profil de la version qui le livre.
2. Pour un refus sur migration en échec, remplacer le contrôle « base inchangée » (SHA-256) par : aucune perte dans les tables de données, et la dernière copie `pre-migrate-*` identique à la base d'avant le saut.
3. Optionnel : un mode ou une option pour injecter un doublon dans la copie de travail, afin de rejouer ce cas sans préparer un jeu d'essai modifié à la main.

## Critères d'acceptation

- [ ] Sur un jeu d'essai avec doublon, le saut vers la version qui livre C-18 est rapporté comme un refus propre (0 échec inattendu) en mode naïf.
- [ ] Le refus de la baseline `0_init` reste reconnu comme avant.
- [ ] Tests unitaires du banc adaptés (`node --test scripts/upgrade-test/test/*.test.mjs`).

## Tests à ajouter ou adapter

- `checks.test.mjs` (ou un nouveau fichier pour `lib/bench.mjs`) : refus avec chacun des messages, contrôle de la copie `pre-migrate`.

## Points d'attention

- Le jeu d'essai reste hors du dépôt ; le rapport ne contient que des nombres.

## Journal

- 2026-10-12 : tâche créée pendant C-18 (point d'attention « le banc attend un refus propre »).
