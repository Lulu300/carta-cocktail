---
id: C-28
title: "UPGRADING.md : section « Restoring a backup from an older version »"
phase: C
lane: docs
criticite: haute
effort: S
status: todo
owner: agent
depends_on: [C-22]
touches: [UPGRADING.md]
sources: []
branch:
pr:
---

## Contexte

C-22 (PR #88) affiche un avertissement après la restauration d'une sauvegarde d'un schéma plus ancien (`restartRecommended: true`). En en comme en fr, ce texte renvoie à une section d'`UPGRADING.md` intitulée exactement « Restoring a backup from an older version » (ancre `#restoring-a-backup-from-an-older-version`). Cette section n'existe pas encore.

**Cette tâche se fait dans la PR de notes de v1.11.0**, mergée avant la première pré-version (exception de la règle 9 pour les tâches de release). Le titre est une décision du coordinateur : il ne change pas sans mettre à jour la clé `settings.backup.restartMayFail` des locales en/fr.

## Problème constaté

- Aujourd'hui, la seule consigne est la puce « **Restoring a backup made before v1.8.0.** » de la section `## v1.10.0`. Elle dépend de la version et ne couvre pas les sauvegardes de v1.8.0 à v1.10.0.
- Depuis C-11 (colonne `User.tokenVersion`, livrée en v1.11.0), restaurer **toute** sauvegarde antérieure à la version courante laisse la table `User` sans la colonne jusqu'au redémarrage du backend. Tant que le redémarrage n'a pas eu lieu, la connexion, `GET /api/auth/me`, les pages admin et la carte publique d'un navigateur qui envoie un token (`optionalAuth`) répondent 500.

## Ce qu'il faut faire

Ajouter dans `UPGRADING.md` une section indépendante de la version, intitulée exactement `Restoring a backup from an older version` :

1. Toute sauvegarde antérieure à la version courante demande une mise à jour de la base après la restauration. Avec Docker, il suffit de redémarrer le backend : l'entrypoint applique les migrations (`prisma migrate deploy`). Sans Docker, lancer `npm run db:deploy` dans `backend/`, puis redémarrer.
2. Depuis v1.11.0 (C-11), la connexion et les pages admin répondent 500 tant que ce n'est pas fait, ainsi que la carte publique dans un navigateur connecté. L'écran de restauration le signale.
3. Les cas où le redémarrage ne suffit pas : sauvegarde v1.0.x (refus de la baseline `0_init`, `refuse_baseline`), et sauvegarde d'avant v1.8.0 avec des noms de catégories ou des abréviations d'unités en double (contrôle `schema_integrity`). Le backend ne démarre pas. Pour revenir à la base précédente, remettre la copie `pre-restore-<date>.db` (`/app/data/backups/`), comme dans README › « Restoring a pre-migration backup ».
4. Faire pointer la puce de la section v1.10.0 vers cette section, ou la remplacer par un lien.

## Critères d'acceptation

- [ ] `UPGRADING.md` contient une section intitulée exactement `Restoring a backup from an older version`, et l'ancre `#restoring-a-backup-from-an-older-version` y mène.
- [ ] La section couvre les points 1 à 3 ci-dessus, avec et sans Docker.
- [ ] Le texte de `settings.backup.restartMayFail` (en/fr) cite toujours ce titre exact.

## Tests à ajouter ou adapter

Aucun (documentation). Vérifier l'ancre dans l'aperçu Markdown de GitHub.

## Points d'attention

- Le texte doit rester vrai après une future migration : ne pas promettre que la connexion échoue pour toute sauvegarde ancienne (seulement celles d'avant v1.11.0), ni qu'un redémarrage suffit toujours.

## Journal

- 2026-10-11 : tâche créée par C-22 (revue de la PR #88, décision du coordinateur sur le titre de la section).
