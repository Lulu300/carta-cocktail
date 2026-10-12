---
id: C-18
title: "Migration en échec au démarrage : message clair et procédure de reprise"
phase: C
lane: backend
criticite: moyenne
effort: S
status: done
owner: agent
depends_on: [C-07]
touches: [backend/docker-entrypoint.sh, README.md, backend/src/bootstrap/migrationState.ts, backend/src/scripts/migration-state.ts, backend/src/lib/databasePath.ts, backend/src/scripts/check-integrity.ts, backend/vitest.config.ts, .github/workflows/ci.yml, backend/AGENTS.md]
sources: ["02-backend-data-perf.md §2.4"]
branch: feature/C-18-failed-migration-recovery
pr: "#120"
---

## Contexte

Trouvé pendant C-07. Sous SQLite, Prisma n'exécute pas une migration dans une transaction : si une instruction échoue, les précédentes restent appliquées et la migration est notée en échec dans `_prisma_migrations`. Essai sur une base jetable avec la migration `schema_integrity` dans l'ordre généré par Prisma : la table `Bottle` était déjà reconstruite quand l'index unique de `Category.name` a échoué.

C-07 place les index uniques en tête de sa migration : un doublon l'arrête avant toute modification. Mais le problème reste général pour les migrations suivantes, et la reprise n'est documentée nulle part.

## Problème constaté

- Après un échec, chaque redémarrage du conteneur s'arrête sur `P3009` (« migrate found failed migrations ») sans dire quoi faire.
- Revenir à l'image précédente ne suffit pas : l'ancienne version voit aussi la migration en échec.
- La seule reprise sûre est la copie `pre-migrate-*` de C-01, mais ni le README ni l'entrypoint ne l'expliquent pour ce cas.

## Ce qu'il faut faire

1. `docker-entrypoint.sh` : quand `migrate deploy` échoue avec `P3018` ou `P3009`, afficher un message clair : nom de la migration en échec, chemin de la dernière copie `pre-migrate-*`, et renvoi vers la procédure du README. Ne rien modifier dans la base.
2. README, section « Database migrations » : procédure de reprise. Arrêter le backend, remplacer la base par la copie `pre-migrate-*` (fichiers `-wal` compris), corriger la cause (par exemple les doublons signalés par `scripts/check-integrity.ts`), puis redémarrer. Variante sans restauration, quand la migration a échoué sur sa première instruction : `npx prisma migrate resolve --rolled-back <migration>`.
3. Règle d'écriture des migrations dans le README : placer en tête les instructions qui peuvent échouer sur des données existantes (index uniques, `CHECK`), avant toute reconstruction de table.

## Critères d'acceptation

- [x] Une migration en échec affiche au démarrage son nom, la copie à restaurer et le renvoi vers la procédure.
- [x] La procédure de reprise est dans le README et a été suivie une fois sur une base jetable.
- [x] La règle d'écriture des migrations est documentée.
- [x] Après `prisma migrate resolve --rolled-back`, le démarrage suivant fait une copie `pre-migrate` avant d'appliquer la migration.

## Tests à ajouter ou adapter

- Test de l'entrypoint (si D-02 fournit un harnais) ou essai manuel décrit dans la PR : base avec doublons de catégories, démarrage refusé, message affiché, reprise par la copie.
- Base jetable : `deploy` en échec (P3018), correction, `migrate resolve --rolled-back`, puis démarrage du conteneur : une nouvelle copie `pre-migrate-*` est créée avant que la migration soit appliquée.

## Points d'attention

- Le banc `scripts/upgrade-test/` attend un refus propre (message et base inchangée) : vérifier qu'il reconnaît ce nouveau cas.
- Ne jamais restaurer automatiquement : la décision reste humaine.
- 2026-10-10, transmis par C-07 (deuxième revue de la PR #60, point 10) : après `prisma migrate resolve --rolled-back`, `prisma migrate status` répond « Database schema is up to date! » (code 0) alors que la migration est encore à appliquer. L'entrypoint ne sauvegarde que si `migrate status` échoue : la nouvelle tentative applique donc la migration sans copie `pre-migrate`. L'entrypoint doit sauvegarder dès qu'une migration du dossier `prisma/migrations/` n'a pas de ligne terminée (`finished_at` non nul, `rolled_back_at` nul) dans `_prisma_migrations`, au lieu de se fier au seul code de sortie de `migrate status`.

## Journal

- 2026-10-10 : tâche créée pendant C-07 (migrations SQLite non transactionnelles, reprise non documentée).
- 2026-10-12 : D-01 (PR #108, tini) : un `docker stop` arrive maintenant à l'entrypoint au lieu d'être ignoré. Une demande d'arrêt laisse finir la commande en cours et ne démarre plus aucune nouvelle étape (ni sauvegarde, ni migration, ni étape de la baseline, ni seed) ; une migration plus longue que le délai d'arrêt de Docker (10 s) est tuée comme avant et laisse `P3009` au démarrage suivant (vérifié avec une migration lente). Le script de contrôle d'intégrité est maintenant `src/scripts/check-integrity.ts` (`node dist/scripts/check-integrity.js` dans l'image), et l'image tourne sous `node` : une reprise lancée avec `--entrypoint sh` aussi.
- 2026-10-12 : implémentation (PR #120). La décision de sauvegarde ne repose plus sur `prisma migrate status` : `src/bootstrap/migrationState.ts` lit `_prisma_migrations` (client partagé, lecture seule) et liste les migrations du dossier sans ligne terminée non annulée (`unapplied`) et les migrations en échec (`failed`) ; `node dist/scripts/migration-state.js` les imprime pour l'entrypoint. Copie `pre-migrate` dès qu'une migration est à appliquer, y compris après `resolve --rolled-back` (point de C-07) ; aucune copie tant qu'une migration est marquée en échec, sinon une copie de la base à moitié migrée deviendrait la plus récente (cas décrit dans UPGRADING › v1.8.0 › Rolling back) ; copie quand même si l'historique est illisible. Sur `P3018`/`P3009`, y compris après la baseline `0_init`, message : nom de la migration (lu dans `_prisma_migrations`), dernière copie `pre-migrate-*`, renvoi au README ; rien n'est restauré. Arrêt de D-01 inchangé : un `docker stop` reçu pendant la lecture de l'état sort avant la sauvegarde (vérifié, exit 143, aucune copie).
- 2026-10-12 : écarts. `touches` complété : `migrationState.ts` (+ tests), `scripts/migration-state.ts` (+ test), exclusions de couverture du script dans `vitest.config.ts` et `ci.yml`, `backend/AGENTS.md` (structure). `databaseFileExists()` déplacée de `check-integrity.ts` vers `lib/databasePath.ts` pour être partagée par les deux scripts (fs seulement, import Node intégré : compatible avec la copie du fichier dans l'image, voir D-26). Essais Docker sur base synthétique (doublon de catégorie) : (1) base `db push` : copie, baseline, `P3018` + message, redémarrage `P3009` + même copie et aucune nouvelle, restauration par la commande du README, correction, contrôle d'intégrité 0, démarrage OK avec une nouvelle copie ; (2) `0_init` appliquée : `P3018`, `resolve --rolled-back`, l'état liste à nouveau la migration, correction, démarrage : nouvelle copie `pre-migrate` puis migrations appliquées.
- 2026-10-12 : banc (`--path 1.4.0,1.11.0,local --mode both`, avec le hook temporaire de D-01, PR #108) : `friend` et `official` OK en naïf et conforme. Copie du jeu d'essai avec une catégorie en double, `1.4.0,local` naïf : refus avec le message de C-18, 1 copie `pre-migrate` pour 3 démarrages, aucune perte ; le banc ne reconnaît pas encore ce refus (message attendu de `0_init`, base modifiée par la ligne en échec) : nouvelle tâche C-37.
- 2026-10-12 : Notes de version : pas d'action obligatoire. Une migration en échec affiche son nom, la copie à restaurer et la procédure (README › « Recovering from a failed migration »). L'entrypoint fait une copie `pre-migrate` avant la nouvelle tentative après `prisma migrate resolve --rolled-back`, et plus aucune copie tant qu'une migration est en échec : les remarques de UPGRADING › v1.8.0 › Rolling back sur ces deux points ne valent plus que pour les images v1.8.0 à v1.11.x.
