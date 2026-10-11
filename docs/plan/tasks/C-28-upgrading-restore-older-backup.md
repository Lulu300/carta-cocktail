---
id: C-28
title: "UPGRADING.md : section « Restoring a backup from an older version »"
phase: C
lane: docs
criticite: haute
effort: S
status: done
owner: agent
depends_on: [C-22]
touches: [UPGRADING.md]
sources: []
branch: docs/release-notes-v1.11.0
pr:
---

## Contexte

C-22 (PR #88) affiche un avertissement après la restauration d'une sauvegarde d'un schéma plus ancien (`restartRecommended: true`). En en comme en fr, ce texte renvoie à une section d'`UPGRADING.md` intitulée exactement « Restoring a backup from an older version » (ancre `#restoring-a-backup-from-an-older-version`). Cette section n'existe pas encore.

**Cette tâche se fait dans la PR de notes de v1.11.0**, mergée avant la première pré-version (exception de la règle 9 pour les tâches de release). Le titre est une décision du coordinateur : il ne change pas sans mettre à jour la clé `settings.backup.restartMayFail` des locales en/fr.

## Problème constaté

- Aujourd'hui, la seule consigne est la puce « **Restoring a backup made before v1.8.0.** » de la section `## v1.10.0`. Elle dépend de la version et ne couvre pas les sauvegardes de v1.8.0 à v1.10.0.
- Depuis C-11 (colonne `User.tokenVersion`, livrée en v1.11.0), restaurer **toute** sauvegarde antérieure à v1.11.0 laisse la table `User` sans la colonne jusqu'au redémarrage du backend. Tant que le redémarrage n'a pas eu lieu, la connexion, `GET /api/auth/me`, les pages admin et la carte publique d'un navigateur qui envoie un token (`optionalAuth`) répondent 500.

## Ce qu'il faut faire

Ajouter dans `UPGRADING.md` une section indépendante de la version, intitulée exactement `Restoring a backup from an older version` :

1. Toute sauvegarde dont le schéma est plus ancien que celui de la version installée demande une mise à jour de la base après la restauration (l'écran de restauration le signale : `restartRecommended` compare les schémas, une version sans migration n'en demande pas). Avec Docker, il suffit de redémarrer le backend : l'entrypoint applique les migrations (`prisma migrate deploy`). Sans Docker, lancer `npm run db:deploy` dans `backend/`, puis redémarrer.
2. Depuis v1.11.0 (C-11), la connexion et les pages admin répondent 500 tant que ce n'est pas fait, ainsi que la carte publique dans un navigateur connecté. L'écran de restauration le signale.
3. Les cas où le redémarrage ne suffit pas : sauvegarde v1.0.x (refus de la baseline `0_init`, `refuse_baseline`), et sauvegarde d'avant v1.8.0 avec des noms de catégories ou des abréviations d'unités en double (contrôle `schema_integrity`). Le backend ne démarre pas. Sans Docker, s'y ajoute toute sauvegarde de v1.5.0 ou plus ancienne (dès v1.1), qui n'a pas de table `_prisma_migrations` : `npm run db:deploy` s'arrête sur `P3005`, il faut d'abord marquer la base avec `npx prisma migrate resolve --applied 0_init` dans `backend/`, comme dans README › « Database migrations » (avec Docker, l'entrypoint le fait). Pour revenir à la base précédente, remettre la copie `pre-restore-<date>.db` (`/app/data/backups/`), comme dans README › « Restoring a pre-migration backup ».
4. Faire pointer la puce de la section v1.10.0 vers cette section, ou la remplacer par un lien.

## Critères d'acceptation

- [x] `UPGRADING.md` contient une section intitulée exactement `Restoring a backup from an older version`, et l'ancre `#restoring-a-backup-from-an-older-version` y mène.
- [x] La section couvre les points 1 à 3 ci-dessus, avec et sans Docker.
- [x] Sans Docker, une sauvegarde de v1.5.0 ou plus ancienne passe d'abord par l'étape de baseline (`npx prisma migrate resolve --applied 0_init`) avant `npm run db:deploy`.
- [x] Le texte de `settings.backup.restartMayFail` (en/fr) cite toujours ce titre exact.

## Tests à ajouter ou adapter

Aucun (documentation). Vérifier l'ancre dans l'aperçu Markdown de GitHub.

## Points d'attention

- Le texte doit rester vrai après une future migration : ne pas promettre que la connexion échoue pour toute sauvegarde ancienne (seulement celles d'avant v1.11.0), ni qu'un redémarrage suffit toujours.

## Journal

- 2026-10-11 : tâche créée par C-22 (revue de la PR #88, décision du coordinateur sur le titre de la section).
- 2026-10-11 : revue de la PR #88 : ajout du cas hors Docker d'une sauvegarde de v1.5.0 ou plus ancienne (baseline avant `db:deploy`), formulation « schéma plus ancien » au point 1.
- 2026-10-11 : fait dans la PR de notes de v1.11.0. Section `## Restoring a backup from an older version` à la fin d'`UPGRADING.md`, citée par l'introduction, la section v1.11.0 et la puce v1.10.0 (remplacée par un renvoi). Sous-sections : mise à jour de la base après la restauration (Docker : redémarrage ; sans Docker : `npm run db:deploy` puis redémarrage), effet depuis v1.11.0 (connexion refusée avec « Invalid email or password », pages admin et carte publique d'un navigateur connecté en erreur serveur), cas où le redémarrage ne suffit pas (v1.0.x, doublons d'avant v1.8.0, et sans Docker v1.5.0 ou plus ancienne : vérification contre `0_init` puis `migrate resolve --applied 0_init` avant `db:deploy`), retour à la copie `pre-restore-<date>.db` (base seulement, les photos restent celles de la sauvegarde). Le titre cité par `settings.backup.restartMayFail` (en/fr) est inchangé.
