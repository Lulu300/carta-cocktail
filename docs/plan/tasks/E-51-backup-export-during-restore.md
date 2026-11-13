---
id: E-51
title: "Export de sauvegarde lancé pendant une restauration : archive mélangée"
phase: E
lane: backend
criticite: basse
effort: S
status: todo
owner: agent
depends_on: [E-49]
touches: [backend/src/routes/backup.ts, backend/src/routes/backup.test.ts, backend/src/services/backupService.ts, backend/src/i18n/]
sources: []
branch: ""
pr: ""
---

## Contexte

Relevé pendant E-49. E-49 refuse une restauration pendant une autre (verrou en mémoire dans `restoreBackup()`, `backend/src/services/backupService.ts`), comme l'a choisi l'humain. Le verrou ne couvre pas l'export (`GET /api/backup/export`, `backend/src/routes/backup.ts`), qui peut tourner en même temps qu'une restauration, depuis un deuxième onglet ou pendant une restauration longue que le proxy a coupée (504, E-47).

## Problème constaté

L'export prend un instantané de la base (`createSnapshot()`, `VACUUM INTO`), puis `archive.directory(config.uploadDir, 'uploads')` lit le dossier `uploads` au fil de l'envoi. Pendant une restauration :

- l'instantané peut être la base d'avant la restauration et les photos celles de la sauvegarde restaurée (ou l'inverse), dans une archive annoncée comme réussie ;
- archiver lit les dossiers cachés (`dot: true` dans `archiver/lib/core.js`) : l'archive peut contenir `uploads/.restore-<stamp>/…` et `uploads/.pre-restore-<stamp>/…`. Restaurer plus tard cette archive aplatit ces entrées par leur nom (`extractUploads()`), et ramène donc des photos de l'un ou l'autre état ;
- une photo déplacée pendant la lecture fait échouer l'export (`ENOENT`, téléchargement coupé par `archive.on('error')`) : ce cas-là est visible, pas silencieux.

Rare : il faut un export pendant les quelques instants où la restauration déplace les fichiers. Les autres écritures pendant une restauration (modifier un cocktail, envoyer une photo) sont perdues comme toutes les données remplacées par la restauration, ce qui est le comportement attendu.

## Ce qu'il faut faire

1. Décider avec l'humain : refuser l'export pendant une restauration (409 traduit, même verrou qu'E-49) et/ou refuser une restauration pendant un export ; ou laisser tel quel.
2. Si refus : partager le verrou d'E-49 au lieu d'en créer un second, et le libérer à la fin de l'envoi de l'archive (`res` `close`), pas à la fin du handler.
3. En tout cas, ne pas mettre les dossiers `.restore-*` et `.pre-restore-*` dans l'archive (filtre sur `archive.directory`).

## Critères d'acceptation

- [ ] Une archive exportée ne contient jamais de dossier `.restore-*` ou `.pre-restore-*`.
- [ ] Selon la décision : un export pendant une restauration (ou l'inverse) reçoit un 409 traduit.

## Tests à ajouter ou adapter

- `backup.test.ts` : export pendant une restauration retenue (même technique que le test concurrent d'E-49) ; archive sans dossier caché.

## Points d'attention

- Un export est un flux : le verrou ne peut être libéré qu'à la fermeture de la réponse, sinon une restauration démarre pendant que l'archive lit encore les photos.

## Journal

- 2026-11-13 : tâche créée pendant E-49.
