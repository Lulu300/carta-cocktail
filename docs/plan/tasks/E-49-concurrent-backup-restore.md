---
id: E-49
title: "Refuser une restauration de sauvegarde pendant qu'une autre est en cours"
phase: E
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: []
touches: [backend/src/routes/backup.ts, backend/src/routes/backup.test.ts, backend/src/services/backupService.ts, backend/src/services/backupService.test.ts, backend/src/i18n/]
sources: []
branch: ""
pr: ""
---

## Contexte

Relevé pendant E-47. Quand une restauration dépasse `proxy_read_timeout` (300 s, `location = /api/backup/import` de `frontend/nginx.conf.template`), nginx répond 504 et coupe la connexion, mais le backend continue : la route `POST /api/backup/import` (`backend/src/routes/backup.ts`) ne surveille pas la fermeture de la connexion, et `restoreBackup()` (`backend/src/services/backupService.ts`) va jusqu'au bout. E-47 affiche alors un message qui demande de ne pas relancer la restauration.

## Problème constaté

Rien n'empêche deux restaurations en même temps. Le bouton « Restore Backup » reste actif après le 504, avec le fichier encore sélectionné, et un deuxième onglet peut aussi en lancer une. Chaque restauration a son propre horodatage (`.restore-<stamp>`, `.pre-restore-<stamp>`, `pre-restore-<stamp>.db`), mais les deux remplacent le même fichier de base et déplacent les mêmes entrées du dossier `uploads`. `swapUploads()` ne laisse de côté que ses propres dossiers : la seconde restauration déplace dans son `.pre-restore-<stamp>` les photos que la première vient de poser, et même les dossiers `.restore-*` et `.pre-restore-*` de la première. Un retour arrière de l'une peut aussi remettre la base d'avant l'autre. Le résultat peut mélanger la base d'une sauvegarde et les photos d'une autre.

## Ce qu'il faut faire

1. Un verrou en mémoire dans `restoreBackup()` (ou la route) : une restauration lancée pendant une autre est refusée avec un 409 et un message traduit (en, fr), sans toucher aux fichiers.
2. Le verrou se libère à la fin de la restauration, réussie ou non.
3. Vérifier que l'écran de sauvegarde affiche ce message tel quel (il affiche le champ `error` du backend).

## Critères d'acceptation

- [ ] Une deuxième restauration lancée pendant la première reçoit un 409 traduit, et la première se termine normalement.
- [ ] Après une restauration réussie ou échouée, une nouvelle restauration est acceptée.

## Tests à ajouter ou adapter

- `backupService.test.ts` ou `backup.test.ts` : deux restaurations simultanées (la première retenue), la seconde refusée ; verrou libéré après un échec.

## Points d'attention

- Un seul processus backend : un verrou en mémoire suffit. Le fichier temporaire de multer de la requête refusée doit quand même être supprimé.
- E-48 (délai de Node pendant l'envoi) touche aussi la restauration, mais pas les mêmes fichiers.

## Journal

- 2026-11-13 : tâche créée pendant E-47.
