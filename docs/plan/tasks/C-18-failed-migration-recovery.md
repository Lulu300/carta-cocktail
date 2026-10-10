---
id: C-18
title: "Migration en échec au démarrage : message clair et procédure de reprise"
phase: C
lane: backend
criticite: moyenne
effort: S
status: todo
owner: agent
depends_on: [C-07]
touches: [backend/docker-entrypoint.sh, README.md]
sources: ["02-backend-data-perf.md §2.4"]
branch:
pr:
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

- [ ] Une migration en échec affiche au démarrage son nom, la copie à restaurer et le renvoi vers la procédure.
- [ ] La procédure de reprise est dans le README et a été suivie une fois sur une base jetable.
- [ ] La règle d'écriture des migrations est documentée.

## Tests à ajouter ou adapter

- Test de l'entrypoint (si D-02 fournit un harnais) ou essai manuel décrit dans la PR : base avec doublons de catégories, démarrage refusé, message affiché, reprise par la copie.

## Points d'attention

- Le banc `scripts/upgrade-test/` attend un refus propre (message et base inchangée) : vérifier qu'il reconnaît ce nouveau cas.
- Ne jamais restaurer automatiquement : la décision reste humaine.

## Journal

- 2026-10-10 : tâche créée pendant C-07 (migrations SQLite non transactionnelles, reprise non documentée).
