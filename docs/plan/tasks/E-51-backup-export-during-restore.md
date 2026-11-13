---
id: E-51
title: "Export de sauvegarde lancé pendant une restauration : archive mélangée"
phase: E
lane: backend
criticite: basse
effort: S
status: done
owner: agent
depends_on: [E-49]
touches: [backend/src/routes/backup.ts, backend/src/routes/backup.test.ts, backend/src/services/backupService.ts, backend/src/i18n/]
sources: []
branch: fix/E-51-backup-export-during-restore
pr: "#185"
---

## Contexte

Relevé pendant E-49. E-49 refuse une restauration pendant une autre (verrou en mémoire dans `restoreBackup()`, `backend/src/services/backupService.ts`), comme l'a choisi l'humain. Le verrou ne couvre pas l'export (`GET /api/backup/export`, `backend/src/routes/backup.ts`), qui peut tourner en même temps qu'une restauration, depuis un deuxième onglet ou pendant une restauration longue que le proxy a coupée (504, E-47).

## Problème constaté

L'export prend un instantané de la base (`createSnapshot()`, `VACUUM INTO`), puis `archive.directory(config.uploadDir, 'uploads')` lit le dossier `uploads` au fil de l'envoi. Pendant une restauration :

- l'instantané peut être la base d'avant la restauration et les photos celles de la sauvegarde restaurée (ou l'inverse), dans une archive annoncée comme réussie ;
- archiver lit les dossiers cachés (`dot: true` dans `archiver/lib/core.js`) : l'archive peut contenir `uploads/.restore-<stamp>/…` et `uploads/.pre-restore-<stamp>/…`. Restaurer plus tard cette archive aplatit ces entrées par leur nom (`extractUploads()`), et ramène donc des photos de l'un ou l'autre état ;
- une photo déplacée pendant la lecture fait échouer l'export (`ENOENT`, téléchargement coupé par `archive.on('error')`) : ce cas-là est visible, pas silencieux.

Un dossier `.pre-restore-<stamp>` laissé par un `removePreviousUploads()` en échec (la restauration réussit quand même) est aussi exporté par tout export ultérieur, même lancé seul.

Rare pendant une restauration, mais la fenêtre n'est pas instantanée : `.restore-<stamp>` existe du début de l'extraction des photos (durée qui croît avec la taille de l'archive) jusqu'à la fin du basculement. Les autres écritures pendant une restauration (modifier un cocktail, envoyer une photo) sont perdues comme toutes les données remplacées par la restauration, ce qui est le comportement attendu.

## Ce qu'il faut faire

1. Décider avec l'humain : refuser l'export pendant une restauration (409 traduit, même verrou qu'E-49) et/ou refuser une restauration pendant un export ; ou laisser tel quel.
2. Si refus : partager le verrou d'E-49 au lieu d'en créer un second, et le libérer à la fin de l'envoi de l'archive (`res` `close`), pas à la fin du handler.
3. En tout cas, ne pas mettre les dossiers `.restore-*` et `.pre-restore-*` dans l'archive (filtre sur `archive.directory`).

## Critères d'acceptation

- [x] Une archive exportée ne contient jamais de dossier `.restore-*` ou `.pre-restore-*`.
- [x] Selon la décision : un export pendant une restauration (ou l'inverse) reçoit un 409 traduit.

## Tests à ajouter ou adapter

- `backup.test.ts` : export pendant une restauration retenue (même technique que le test concurrent d'E-49) ; archive sans dossier caché.

## Points d'attention

- Un export est un flux : le verrou ne peut être libéré qu'à la fermeture de la réponse, sinon une restauration démarre pendant que l'archive lit encore les photos.

## Journal

- 2026-11-13 : tâche créée pendant E-49. Précisions de la relecture de #184 : durée de la fenêtre, dossier `.pre-restore-*` laissé par un nettoyage en échec.
- 2026-11-13 : décision de l'humain (« E-51 before the rc ») : l'export répond 409 pendant une restauration (même verrou qu'E-49) et ne met pas les dossiers temporaires de restauration dans l'archive.
- 2026-11-13 : fait (PR #185, branche `fix/E-51-backup-export-during-restore`). Le verrou d'E-49 est étendu, pas doublé : un compteur `exportsInProgress` s'ajoute à `restoreInProgress`. `beginExport()` refuse pendant une restauration (409 `errors.restoreInProgress`, message existant) et renvoie la fonction qui termine l'export, sans effet si on l'appelle deux fois. `restoreBackup()` refuse aussi tant qu'un export est en cours (409, nouveau message `errors.exportInProgress`, en et fr). Deux exports peuvent tourner ensemble. L'inverse (restauration pendant un export) est couvert. L'export prend son instantané, puis lit `uploads/` pendant l'envoi : une restauration qui bascule les photos à ce moment donne un téléchargement coupé (`ENOENT`), ou une archive avec l'ancienne base et les photos restaurées, annoncée comme réussie. L'export se termine à la fermeture de la réponse (`res` `close`), pas à la fin du handler. Quand le client part en cours de route, l'archive reste en pause et le handler ne rend jamais la main (testé). Après une erreur d'archive, `finalize()` rejette. Dans ces deux cas, une fin placée dans le handler garderait le verrou jusqu'au redémarrage. `archive.directory()` devient `archive.glob('**', { dot: true, skip: RESTORE_WORK_FOLDERS })`. `skip` ne vise que les dossiers et `*` ne traverse pas `/` : seuls les dossiers `.restore-*` et `.pre-restore-*` à la racine de `uploads/` sont exclus, et ils ne sont pas parcourus. Un dossier de même nom plus bas, ou un fichier qui commence ainsi, reste dans l'archive. En dehors de ces deux dossiers, les entrées sont les mêmes qu'avant (vérifié à la main). Aucun changement frontend : `SettingsPage` affiche le champ `error` du 409, pour l'export comme pour la restauration. Tests dans `routes/backup.test.ts` :
  - export pendant une restauration retenue ;
  - restauration pendant un export, retenu sur sa copie de la base puis envoyé à un client qui ne lit rien ;
  - deux exports simultanés ;
  - archive sans dossier de travail ;
  - dossier `.pre-restore-*` restant, absent de l'export suivant.

  Neuf sondes de sabotage, toutes détectées (détail dans la PR).
- Notes de version : un export de sauvegarde lancé pendant une restauration est désormais refusé avec « A backup restore is already in progress… ». Une restauration lancée pendant un export est refusée avec « A backup is being exported: wait for its download to finish, then start the restore again ». Les archives exportées ne contiennent plus les dossiers temporaires de restauration (`uploads/.restore-*`, `uploads/.pre-restore-*`).
